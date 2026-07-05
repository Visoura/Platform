"""
In-process playback threads: one per (session, camera), started from the
session-create view and stopped from terminate. Replays a camera's
precomputed frames+detections (see streaming/preprocessing.py) at a paced,
looping rate straight to the session's websocket group - no live AI calls,
no message broker, just disk + Channels.

Tracking mode is global and derived straight from the tracked_people Qdrant
collection, exactly as it was in the old ws-forwarder: if it has any points,
every frame's detections are matched against it and only boxes whose closest
tracked embedding is above the similarity threshold are kept; otherwise every
detected box is forwarded as-is.
"""
import base64
import threading
import time
from typing import Dict, Tuple

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

from tracking.models import Sighting
from tracking.vector_storage import VectorStorage

from .preprocessing import load_detections, load_meta, processed_dir

_registry: Dict[Tuple[str, int], threading.Event] = {}
_lock = threading.Lock()
_storage = VectorStorage()


def start_session_producers(session):
    with _lock:
        for camera in session.cameras.all():
            key = (str(session.id), camera.id)
            if key in _registry:
                continue
            stop_event = threading.Event()
            _registry[key] = stop_event
            thread = threading.Thread(
                target=_play_camera,
                args=(str(session.id), camera.id, camera.name, stop_event),
                daemon=True,
            )
            thread.start()


def stop_session_producers(session_id):
    session_id = str(session_id)
    with _lock:
        for key in [k for k in _registry if k[0] == session_id]:
            _registry.pop(key).set()


CONTINUATION_THRESHOLD_DELTA = 0.10
CONTINUATION_GRACE_SECONDS = 2.0


def _build_boxes(detections, threshold, recent_matches):
    """Only ever returns boxes for people matching a currently-tracked
    embedding - no box is drawn for a detection just because it exists.
    With tracking off there's nothing to match against, so nothing is
    drawn at all (clicking to start tracking someone still works - the
    click is matched against precomputed detections server-side regardless
    of whether a box was ever shown).

    Matching is otherwise fully stateless per frame, which means a
    person's score dipping for even one frame (pose change, motion blur,
    a partial turn) drops the match entirely, and they have to clear the
    full acquisition threshold again from scratch to reappear - visible
    as flicker (looking tracked, then not, then tracked again). To smooth
    that out, a target matched within the last CONTINUATION_GRACE_SECONDS
    only needs to clear a lower continuation bar to keep its match going,
    instead of the full threshold on every single frame - hysteresis, not
    a change to how hard it is to acquire a match on someone new.
    recent_matches (dict[target_id -> monotonic timestamp of last match],
    mutated in place) carries this across frames within one camera's
    playback thread."""
    if not detections:
        return []

    tracking_enabled = _storage.count_points() > 0
    if not tracking_enabled:
        return []

    embeddings = [d['embedding'] for d in detections]
    continuation_threshold = max(0.0, threshold - CONTINUATION_THRESHOLD_DELTA)
    matches = _storage.search_similar_batch(embeddings, limit=1, threshold=continuation_threshold)

    # Each detection independently finds its own closest tracked embedding,
    # so two different people in the same frame could both come back as the
    # closest match for the same target_id (e.g. similar clothing/pose). A
    # single tracked person can't physically appear twice in one frame, so
    # enforce a 1:1 assignment here: if more than one detection claims the
    # same target_id, keep only the highest-scoring one and drop the rest
    # (they just go unmatched for this frame, rather than being reassigned
    # to a different tracked person they're a worse fit for).
    now = time.monotonic()
    best_by_target = {}
    for det, match_points in zip(detections, matches):
        if not match_points:
            continue
        point = match_points[0]
        is_recent = (now - recent_matches.get(point.id, -1e9)) <= CONTINUATION_GRACE_SECONDS
        required = continuation_threshold if is_recent else threshold
        if point.score < required:
            continue
        existing = best_by_target.get(point.id)
        if existing is None or point.score > existing[1].score:
            best_by_target[point.id] = (det, point)

    boxes = []
    for target_id, (det, point) in best_by_target.items():
        recent_matches[target_id] = now
        boxes.append({
            'bbox': det['bbox'],
            'confidence': det['confidence'],
            'matched': True,
            'target_id': point.id,
            'score': point.score,
            'source': (point.payload or {}).get('source'),
        })
    return boxes


SIGHTING_GRACE_SECONDS = 2.0


def _sighting_payload(sighting, camera_name):
    return {
        'camera_id': sighting.camera_id,
        'camera_name': camera_name,
        'started_at': sighting.started_at.isoformat(),
        'ended_at': sighting.ended_at.isoformat() if sighting.ended_at else None,
        'duration_sec': (sighting.ended_at - sighting.started_at).total_seconds() if sighting.ended_at else None,
    }


def _broadcast_sighting(channel_layer, sighting, camera_name):
    """Pushes this sighting's current state to the Track History page for
    this target_id, if anyone has it open - see streaming/consumers.py's
    TargetHistoryConsumer. Harmless if nobody's listening (group_send to an
    empty group is a no-op)."""
    async_to_sync(channel_layer.group_send)(
        f'target_history_{sighting.target_id}',
        {'type': 'sighting.update', 'payload': _sighting_payload(sighting, camera_name)},
    )


def _update_sightings(camera_id, camera_name, boxes, visible_sightings, last_seen, channel_layer):
    """Logs a real Sighting row for every continuous period a tracked person
    is actually visible on this camera. A sighting is only closed after a
    brief grace period of continuous absence, not the instant a single
    frame fails to match - the similarity score flickers slightly frame to
    frame near the threshold, and without this a single real appearance
    would fragment into dozens of tiny sub-second sightings. This is the
    only place sighting-history data comes from; there is no backfill."""
    now = timezone.now()
    current_ids = {b['target_id'] for b in boxes if b.get('matched') and b.get('target_id')}

    for target_id in current_ids:
        last_seen[target_id] = now
        if target_id not in visible_sightings:
            sighting = Sighting.objects.create(
                target_id=target_id, camera_id=camera_id, started_at=now,
            )
            visible_sightings[target_id] = sighting
            _broadcast_sighting(channel_layer, sighting, camera_name)

    for target_id in list(visible_sightings):
        if target_id in current_ids:
            continue
        if (now - last_seen[target_id]).total_seconds() >= SIGHTING_GRACE_SECONDS:
            sighting = visible_sightings.pop(target_id)
            sighting.ended_at = last_seen.pop(target_id)
            sighting.save(update_fields=['ended_at'])
            _broadcast_sighting(channel_layer, sighting, camera_name)


def _close_sightings(visible_sightings, last_seen, camera_name, channel_layer):
    for target_id, sighting in visible_sightings.items():
        sighting.ended_at = last_seen.get(target_id, timezone.now())
        sighting.save(update_fields=['ended_at'])
        _broadcast_sighting(channel_layer, sighting, camera_name)


def _play_camera(session_id, camera_id, camera_name, stop_event):
    meta = load_meta(camera_id)
    if not meta or meta['frame_count'] <= 0:
        return  # session creation already validates the camera is preprocessed

    detections_by_seq = load_detections(camera_id)
    frames_dir = processed_dir(camera_id) / 'frames'
    frame_count = meta['frame_count']
    frame_delay = 1.0 / meta['fps']
    threshold = settings.TRACKING_MATCH_THRESHOLD
    channel_layer = get_channel_layer()

    frame_seq = 0
    visible_sightings = {}
    last_seen = {}
    recent_matches = {}
    try:
        while not stop_event.is_set():
            frame_path = frames_dir / f'{frame_seq:06d}.jpg'
            frame_b64 = base64.b64encode(frame_path.read_bytes()).decode('utf-8')
            boxes = _build_boxes(detections_by_seq.get(frame_seq, []), threshold, recent_matches)
            _update_sightings(camera_id, camera_name, boxes, visible_sightings, last_seen, channel_layer)

            payload = {
                'camera_id': camera_id,
                'camera_name': camera_name,
                'frame_seq': frame_seq,
                'timestamp': time.time(),
                'frame': frame_b64,
                'boxes': boxes,
            }
            async_to_sync(channel_layer.group_send)(
                f'session_{session_id}',
                {'type': 'frame.message', 'payload': payload},
            )

            frame_seq = (frame_seq + 1) % frame_count
            time.sleep(frame_delay)
    finally:
        _close_sightings(visible_sightings, last_seen, camera_name, channel_layer)
