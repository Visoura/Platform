import threading
from contextlib import nullcontext

import numpy as np

from ..settings import REID_DIM
from .crops import crops_cpu, crops_gpu
from .detector import Detector
from .reid import build_embedder


class LocalModels:
    remote = False

    def __init__(self, flags, metrics=None):
        self.detector = Detector(flags)
        self.embedder = build_embedder(flags)
        self.crop = crops_gpu if flags.gpu_crops else crops_cpu
        self.metrics = metrics
        self.lock = threading.Lock()

    def timer(self, stage):
        return self.metrics.time(stage) if self.metrics else nullcontext()

    def detect(self, images):
        with self.lock:
            return self.detector.detect(images)

    def embed(self, images, boxes_per_image):
        counts = [len(b) for b in boxes_per_image]
        if not sum(counts):
            return [np.zeros((0, REID_DIM), np.float32) for _ in counts]
        with self.lock:
            with self.timer("crop"):
                crops = self.crop(images, boxes_per_image)
            with self.timer("reid"):
                embeddings = self.embedder(crops)
        return np.split(embeddings, np.cumsum(counts)[:-1])

    def process(self, images):
        boxes = self.detect(images)
        return boxes, self.embed(images, boxes)

    def embed_crops(self, crops):
        boxes = [np.array([[0, 0, c.shape[1], c.shape[0], 1]], np.float32) for c in crops]
        return np.concatenate(self.embed(crops, boxes))

    def close(self):
        pass
