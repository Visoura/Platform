import importlib.util
from functools import cache

import torch

from .settings import DEVICE


@cache
def compiler():
    if DEVICE == "cuda" and importlib.util.find_spec("tensorrt"):
        return "tensorrt"
    if DEVICE == "mps" and importlib.util.find_spec("coremltools"):
        return "coreml"
    return None


def gpu_name():
    if DEVICE == "cuda":
        return torch.cuda.get_device_name(0)
    if DEVICE == "mps":
        return "Apple GPU (MPS)"
    return "CPU only"
