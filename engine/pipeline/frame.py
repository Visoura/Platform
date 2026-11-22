from dataclasses import dataclass, field

import numpy as np


@dataclass
class Detection:
    box: np.ndarray
    track_id: int | None = None
    embedding: np.ndarray | None = None
    target: str | None = None
    name: str | None = None
    score: float = 0.0


@dataclass
class Frame:
    camera: str
    index: int
    video_ts: float
    ts: float
    image: np.ndarray
    dets: list[Detection] = field(default_factory=list)

    def message(self):
        h, w = self.image.shape[:2]
        boxes = [{
            "box": [round(float(v) / s, 4) for v, s in zip(d.box[:4], (w, h, w, h))],
            "conf": round(float(d.box[4]), 3),
            "track": d.track_id,
            "target": d.target,
            "name": d.name,
            "score": round(d.score, 3),
        } for d in self.dets]
        return {"type": "frame", "camera": self.camera, "index": self.index, "ts": self.ts * 1000, "boxes": boxes}
