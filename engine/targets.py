import base64
import threading
import uuid
from dataclasses import dataclass

import cv2
import numpy as np

from .settings import PERSONS_DIR

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass
class Target:
    id: str
    name: str
    source: str
    embedding: np.ndarray
    thumb: str

    def to_dict(self):
        return {"id": self.id, "name": self.name, "source": self.source, "thumb": self.thumb}


def thumbnail(image, height=128):
    scale = height / image.shape[0]
    small = cv2.resize(image, (max(1, int(image.shape[1] * scale)), height))
    return base64.b64encode(cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 80])[1]).decode()


def person_crop(models, image):
    boxes = models.detect([image])[0]
    if len(boxes):
        areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
        x1, y1, x2, y2 = boxes[areas.argmax(), :4].astype(int)
        if areas.max() < 0.5 * image.shape[0] * image.shape[1]:
            return image[max(y1, 0):y2, max(x1, 0):x2]
    return image


class TargetStore:
    def __init__(self):
        self.targets = {}
        self.lock = threading.Lock()
        self.version = 0

    def add(self, name, source, embedding, crop, target_id=None):
        target = Target(target_id or uuid.uuid4().hex[:8], name, source, np.asarray(embedding, np.float32), thumbnail(crop))
        with self.lock:
            self.targets[target.id] = target
            self.version += 1
        return target

    def remove(self, target_id):
        with self.lock:
            self.targets.pop(target_id, None)
            self.version += 1

    def snapshot(self):
        with self.lock:
            return list(self.targets.values())

    def get(self, target_id):
        return self.targets.get(target_id)

    def load_watchlist(self, models):
        with self.lock:
            self.targets = {k: v for k, v in self.targets.items() if v.source != "watchlist"}
        paths = sorted(p for p in PERSONS_DIR.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS)
        crops = [person_crop(models, cv2.imread(str(p))) for p in paths]
        if not crops:
            return
        embeddings = models.embed_crops(crops)
        for path, crop, embedding in zip(paths, crops, embeddings):
            self.add(path.stem, "watchlist", embedding, crop, target_id=f"w-{path.stem}")
