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
    run_detector: bool = True
    dets: list[Detection] = field(default_factory=list)
