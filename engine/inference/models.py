import threading

import numpy as np

from ..metrics import Metrics
from ..settings import REID_DIM
from .crops import crop_batch
from .detector import Detector
from .reid import Embedder


class Models:
    def __init__(self):
        self.detector = Detector()
        self.embedder = Embedder()
        self.metrics = Metrics()
        self.lock = threading.Lock()

    def detect(self, images):
        if not images:
            return []
        with self.lock:
            return self.detector.detect(images)

    def embed(self, images, boxes_per_image):
        counts = [len(b) for b in boxes_per_image]
        if not sum(counts):
            return [np.zeros((0, REID_DIM), np.float32) for _ in counts]
        with self.lock:
            with self.metrics.time("crop"):
                crops = crop_batch(images, boxes_per_image)
            with self.metrics.time("reid"):
                embeddings = self.embedder(crops)
        return np.split(embeddings, np.cumsum(counts)[:-1])

    def embed_crops(self, crops):
        boxes = [np.array([[0, 0, c.shape[1], c.shape[0], 1]], np.float32) for c in crops]
        return np.concatenate(self.embed(crops, boxes))
