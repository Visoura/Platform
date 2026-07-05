"""
Offline preprocessing: run detection+embedding once per camera video and
cache the results to disk (media/processed/cam{id}/), so live sessions
(streaming/playback.py) can replay frames+boxes without ever calling the AI
service themselves. This is the only module that still calls the AI service.
"""
import base64
import json
import shutil
import struct
import threading
from datetime import datetime, timezone
from pathlib import Path

import cv2
from django.conf import settings

from .ai_client import call_ai_batch

_status: dict = {}
_lock = threading.Lock()

# Parsed detections/meta are cached per-process, keyed by camera_id - once a
# camera's data has been loaded by any session, later sessions reuse it
# instantly instead of re-parsing the file again.
_detections_cache: dict = {}
_meta_cache: dict = {}


def _encode_embedding(embedding: list) -> str:
    """Embeddings stored as base64 packed float32 instead of a JSON array of
    decimal numbers - both far smaller on disk and far faster to parse back
    (struct.unpack vs parsing thousands of float literals per frame)."""
    return base64.b64encode(struct.pack(f'{len(embedding)}f', *embedding)).decode('ascii')


def _decode_embedding(embedding_b64: str) -> list:
    packed = base64.b64decode(embedding_b64)
    return list(struct.unpack(f'{len(packed) // 4}f', packed))


def processed_dir(camera_id) -> Path:
    return Path(settings.MEDIA_ROOT) / 'processed' / f'cam{camera_id}'


def get_status(camera_id) -> dict:
    """{'status': 'not_started'|'processing'|'done'|'failed', ...}"""
    with _lock:
        state = _status.get(camera_id)
        if state:
            return dict(state)
    if (processed_dir(camera_id) / 'meta.json').exists():
        return {'status': 'done'}
    return {'status': 'not_started'}


def start_preprocessing_async(camera) -> bool:
    """Starts preprocessing in a background thread. Returns False if a run
    for this camera is already in progress."""
    with _lock:
        state = _status.get(camera.id)
        if state and state.get('status') == 'processing':
            return False
        _status[camera.id] = {'status': 'processing', 'frames_done': 0, 'total_frames': 0}

    thread = threading.Thread(target=_run_and_track, args=(camera,), daemon=True)
    thread.start()
    return True


def _run_and_track(camera):
    try:
        run_preprocessing(camera)
        with _lock:
            _status[camera.id] = {'status': 'done'}
    except Exception as e:
        with _lock:
            _status[camera.id] = {'status': 'failed', 'error': str(e)}


def run_preprocessing(camera, fps=None, duration=None, progress=None):
    """
    Processes every frame of the source video - no sampling. `fps` and
    `duration` are optional overrides (fps re-labels the recorded playback
    rate, duration caps how much of the source video to read); leave both
    unset to process the whole file at its native fps, which is the
    expectation for these pre-trimmed short clips.
    """
    progress = progress or (lambda msg: None)

    _detections_cache.pop(camera.id, None)
    _meta_cache.pop(camera.id, None)

    out_dir = processed_dir(camera.id)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    frames_dir = out_dir / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)

    width, height = settings.PREPROCESS_FRAME_SIZE
    batch_size = settings.PREPROCESS_BATCH_SIZE

    cap = cv2.VideoCapture(camera.file_path)
    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    playback_fps = fps or native_fps
    max_frames = int(playback_fps * duration) if duration else None
    total_estimate = max_frames or int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or None

    def set_progress(frames_done):
        with _lock:
            _status[camera.id] = {
                'status': 'processing',
                'frames_done': frames_done,
                'total_frames': total_estimate,
            }

    frame_seq = 0
    detections_path = out_dir / 'detections.jsonl'

    with open(detections_path, 'w') as det_file:
        try:
            while max_frames is None or frame_seq < max_frames:
                batch = []
                while len(batch) < batch_size and (max_frames is None or frame_seq < max_frames):
                    ok, frame = cap.read()
                    if not ok:
                        break
                    resized = cv2.resize(frame, (width, height))
                    _, buf = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                    batch.append((frame_seq, buf))
                    frame_seq += 1
                if not batch:
                    break

                b64_frames = [base64.b64encode(buf).decode('utf-8') for _, buf in batch]
                results = call_ai_batch(b64_frames)

                for (seq, buf), detections in zip(batch, results):
                    (frames_dir / f'{seq:06d}.jpg').write_bytes(buf.tobytes())
                    det_file.write(json.dumps({
                        'frame_seq': seq,
                        'timestamp_offset': seq / playback_fps,
                        'detections': [
                            {
                                'bbox': d['bbox'],
                                'confidence': d['confidence'],
                                'embedding_b64': _encode_embedding(d['embedding']),
                            }
                            for d in detections
                        ],
                    }) + '\n')

                progress(f'{frame_seq}/{total_estimate or "?"} frames processed')
                set_progress(frame_seq)
        finally:
            cap.release()

    meta = {
        'fps': playback_fps,
        'frame_count': frame_seq,
        'width': width,
        'height': height,
        'generated_at': datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / 'meta.json').write_text(json.dumps(meta))
    progress(f'Done: {frame_seq} frames -> {out_dir}')
    return meta


def load_meta(camera_id) -> dict | None:
    if camera_id in _meta_cache:
        return _meta_cache[camera_id]
    path = processed_dir(camera_id) / 'meta.json'
    if not path.exists():
        return None
    meta = json.loads(path.read_text())
    _meta_cache[camera_id] = meta
    return meta


def load_detections(camera_id) -> dict:
    """Loads a camera's precomputed per-frame detections into a dict keyed
    by frame_seq (used by playback.py and tracking/views.py's click lookup).
    Cached per-process after the first load - parsing this file is the
    dominant cost in starting a session, and it never changes underneath a
    running process (a fresh preprocess_camera run clears the cache)."""
    if camera_id in _detections_cache:
        return _detections_cache[camera_id]

    path = processed_dir(camera_id) / 'detections.jsonl'
    result = {}
    if not path.exists():
        return result
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            for det in row['detections']:
                det['embedding'] = _decode_embedding(det.pop('embedding_b64'))
            result[row['frame_seq']] = row['detections']

    _detections_cache[camera_id] = result
    return result
