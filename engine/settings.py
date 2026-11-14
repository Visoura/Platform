import os
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("DATA_DIR", ROOT / "data"))

VIDEOS_DIR = DATA / "videos"
PERSONS_DIR = DATA / "persons"
CACHE_DIR = DATA / "cache"
BENCH_DIR = DATA / "bench"
RECORDINGS_DIR = DATA / "recordings"
REID_WEIGHTS = DATA / "weights" / "transformer_120.pth"
YOLO_WEIGHTS = DATA / "weights" / "yolo11n.pt"
DB_PATH = DATA / "sightings.db"
FLAGS_PATH = DATA / "flags.json"

API_PORT = int(os.environ.get("API_PORT", 8000))
INFERENCE_PORT = int(os.environ.get("INFERENCE_PORT", 8001))
RTSP_URL = os.environ.get("RTSP_URL", "rtsp://127.0.0.1:8554")
WEBRTC_PORT = int(os.environ.get("WEBRTC_PORT", 8889))
QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6333")
START_MEDIAMTX = os.environ.get("START_MEDIAMTX", "1") == "1"
RECORD = os.environ.get("RECORD", "0") == "1"

SUBSTREAM_WIDTH = 640
DETECT_CONF = 0.4
REID_SIZE = (256, 128)
REID_DIM = 384
EMBED_EVERY_S = 0.5
SIGHTING_GRACE_S = 2.0
HYSTERESIS = 0.1
RECENT_FRAMES = 20


def pick_device():
    if os.environ.get("DEVICE"):
        return os.environ["DEVICE"]
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


DEVICE = pick_device()

for d in (PERSONS_DIR, CACHE_DIR, BENCH_DIR):
    d.mkdir(parents=True, exist_ok=True)
