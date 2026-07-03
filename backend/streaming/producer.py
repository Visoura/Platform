"""
In-process frame producers: one background thread per (session, camera),
started directly from the session-create view and stopped from terminate.
Reads the camera's video file on loop and pushes JPEG frames into the
Kafka "frames.raw" topic for the GPU consumer worker to pick up.

Each camera gets its own thread pacing itself independently at the same
target FPS, so cameras within a session get an equal, steady production
rate by construction (fairness across cameras is then preserved downstream
in the GPU consumer's batch collection - see run_gpu_consumer.py).
"""
import base64
import threading
import time
from typing import Dict, Tuple

import cv2
from django.conf import settings

from .kafka_utils import ensure_topics, produce_json

_registry: Dict[Tuple[str, int], threading.Event] = {}
_lock = threading.Lock()


def start_session_producers(session):
    ensure_topics()
    with _lock:
        for camera in session.cameras.all():
            key = (str(session.id), camera.id)
            if key in _registry:
                continue
            stop_event = threading.Event()
            _registry[key] = stop_event
            thread = threading.Thread(
                target=_produce_camera_frames,
                args=(str(session.id), camera.id, camera.name, camera.file_path, stop_event),
                daemon=True,
            )
            thread.start()


def stop_session_producers(session_id):
    session_id = str(session_id)
    with _lock:
        for key in [k for k in _registry if k[0] == session_id]:
            _registry.pop(key).set()


def _produce_camera_frames(session_id, camera_id, camera_name, file_path, stop_event):
    width, height = settings.PRODUCER_FRAME_SIZE
    frame_delay = 1.0 / settings.PRODUCER_TARGET_FPS
    batch_size = settings.PRODUCER_BATCH_SIZE

    cap = cv2.VideoCapture(file_path)
    frame_seq = 0
    try:
        while not stop_event.is_set():
            # Read a batch of frames as fast as capacity allows, then push
            # each one to Kafka individually, paced to the target FPS.
            batch = []
            for _ in range(batch_size):
                ok, frame = cap.read()
                if not ok:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = cap.read()
                    if not ok:
                        break
                batch.append(frame)

            if not batch:
                break

            for frame in batch:
                if stop_event.is_set():
                    break
                resized = cv2.resize(frame, (width, height))
                _, buf = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                frame_b64 = base64.b64encode(buf).decode('utf-8')
                produce_json(
                    settings.KAFKA_TOPIC_FRAMES_RAW,
                    key=str(camera_id),
                    value={
                        'session_id': session_id,
                        'camera_id': camera_id,
                        'camera_name': camera_name,
                        'frame_seq': frame_seq,
                        'timestamp': time.time(),
                        'frame': frame_b64,
                    },
                )
                frame_seq += 1
                time.sleep(frame_delay)
    finally:
        cap.release()
