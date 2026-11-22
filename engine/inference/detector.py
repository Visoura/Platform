import numpy as np
from ultralytics import YOLO

from ..settings import DETECT_BATCH, DETECT_CONF, DEVICE, IMGSZ, YOLO_WEIGHTS
from . import compile

RUNTIMES = {".mlpackage": "CoreML", ".engine": "TensorRT"}

class Detector:
    def __init__(self):
        try:
            weights = compile.detector()
        except Exception as e:
            print(f"compiled detector unavailable ({e}), using PyTorch")
            weights = None
        self.name = f"{RUNTIMES[weights.suffix]} fp16" if weights else f"PyTorch {'fp16' if DEVICE != 'cpu' else 'fp32'}"
        self.model = YOLO(str(weights or YOLO_WEIGHTS), task="detect")
        self.options = {"imgsz": IMGSZ, "conf": DETECT_CONF, "classes": [0], "verbose": False}
        if not weights:
            self.options |= {"device": DEVICE, "quantize": 16 if DEVICE != "cpu" else 32}

    def detect(self, images):
        results = []
        for i in range(0, len(images), DETECT_BATCH):
            results += self.model.predict(images[i:i + DETECT_BATCH], **self.options)
        return [r.boxes.data[:, :5].cpu().numpy().astype(np.float32) for r in results]
