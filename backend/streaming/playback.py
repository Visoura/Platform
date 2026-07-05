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


def _build_boxes(detections, threshold):
    """Only ever returns boxes for people matching a currently-tracked
    embedding - no box is drawn for a detection just because it exists.
    With tracking off there's nothing to match against, so nothing is
    drawn at all (clicking to start tracking someone still works - the
    click is matched against precomputed detections server-side regardless
    of whether a box was ever shown)."""
    if not detections:
        return []

    tracking_enabled = _storage.count_points() > 0
    if not tracking_enabled:
        return []

    embeddings = [d['embedding'] for d in detections]
    matches = _storage.search_similar_batch(embeddings, limit=1, threshold=threshold)

    boxes = []
    for det, match_points in zip(detections, matches):
        if match_points:
            boxes.append({
                'bbox': det['bbox'],
                'confidence': det['confidence'],
                'matched': True,
                'target_id': match_points[0].id,
                'score': match_points[0].score,
            })
    return boxes


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
    while not stop_event.is_set():
        frame_path = frames_dir / f'{frame_seq:06d}.jpg'
        frame_b64 = base64.b64encode(frame_path.read_bytes()).decode('utf-8')
        boxes = _build_boxes(detections_by_seq.get(frame_seq, []), threshold)

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
