import numpy as np
from ultralytics import YOLO

from ..settings import DETECT_CONF, DEVICE, YOLO_WEIGHTS
from . import compile

MAX_BATCH = 16


def boxes_per_box(result):
    out = []
    for box in result.boxes:
        if int(box.cls[0]) != 0:
            continue
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
        out.append([x1, y1, x2, y2, float(box.conf[0])])
    return np.array(out, np.float32).reshape(-1, 5)


def boxes_vectorized(result):
    data = result.boxes.data.cpu().numpy()
    data = data[data[:, 5] == 0]
    return data[:, :5].astype(np.float32)


class Detector:
    def __init__(self, flags):
        self.compiled = flags.compiled_detector
        weights = compile.detector(flags.imgsz, flags.fp16) if self.compiled else YOLO_WEIGHTS
        self.model = YOLO(str(weights), task="detect")
        self.options = {"imgsz": flags.imgsz, "conf": DETECT_CONF, "verbose": False}
        if flags.person_only:
            self.options["classes"] = [0]
        if not self.compiled:
            self.options["device"] = DEVICE
            self.options["quantize"] = 16 if flags.fp16 else 32
        self.batch = flags.batch_cameras
        self.boxes = boxes_vectorized if flags.vectorized_boxes else boxes_per_box

    def detect(self, images):
        if not images:
            return []
        if self.batch:
            results = []
            for i in range(0, len(images), MAX_BATCH):
                results += self.model.predict(images[i:i + MAX_BATCH], **self.options)
        else:
            results = [self.model.predict(image, **self.options)[0] for image in images]
        return [self.boxes(r) for r in results]
