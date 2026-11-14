import importlib.util
import shutil
import subprocess
from functools import cache

import httpx
import torch

from .settings import DEVICE, QDRANT_URL


@cache
def hwaccel():
    if not shutil.which("ffmpeg"):
        return None
    out = subprocess.run(["ffmpeg", "-hide_banner", "-hwaccels"], capture_output=True, text=True).stdout
    for name in ("cuda", "videotoolbox"):
        if name in out.split():
            return name
    return None


@cache
def compiler():
    if DEVICE == "cuda" and importlib.util.find_spec("tensorrt"):
        return "tensorrt"
    if DEVICE == "mps" and importlib.util.find_spec("coremltools"):
        return "coreml"
    return None


def qdrant():
    try:
        return httpx.get(f"{QDRANT_URL}/healthz", timeout=0.5).status_code == 200
    except httpx.HTTPError:
        return False


def gpu_name():
    if DEVICE == "cuda":
        return torch.cuda.get_device_name(0)
    if DEVICE == "mps":
        return "Apple GPU (MPS)"
    return "CPU only"


def detect():
    return {
        "device": DEVICE,
        "gpu": gpu_name(),
        "hwaccel": hwaccel(),
        "compiler": compiler(),
        "qdrant": qdrant(),
    }
