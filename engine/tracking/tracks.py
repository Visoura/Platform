from dataclasses import dataclass

import numpy as np

from ..settings import EMBED_EVERY_S, HYSTERESIS


@dataclass
class TrackState:
    embedding: np.ndarray | None = None
    count: int = 0
    last_embed_ts: float = -1e9
    target: str | None = None
    score: float = 0.0
    last_seen_ts: float = 0.0


class TrackMemory:
    def __init__(self):
        self.tracks = {}

    def get(self, track_id):
        return self.tracks.setdefault(track_id, TrackState())

    def needs_embedding(self, track_id, video_ts):
        return video_ts - self.get(track_id).last_embed_ts >= EMBED_EVERY_S

    def add_embedding(self, track_id, embedding, video_ts):
        state = self.get(track_id)
        total = embedding if state.embedding is None else state.embedding * state.count + embedding
        state.count += 1
        state.embedding = total / np.linalg.norm(total)
        state.last_embed_ts = video_ts
        return state.embedding

    def assign(self, track_id, target, score, threshold):
        state = self.get(track_id)
        required = threshold - HYSTERESIS if target is not None and target == state.target else threshold
        if target is not None and score >= required:
            state.target, state.score = target, score
        else:
            state.target, state.score = None, 0.0

    def forget_older_than(self, video_ts, max_age=10.0):
        self.tracks = {k: v for k, v in self.tracks.items() if video_ts - v.last_seen_ts < max_age}


def good_crop(box, image_shape, min_height=0.12, min_conf=0.55, margin=2):
    h, w = image_shape[:2]
    x1, y1, x2, y2, conf = box
    tall_enough = (y2 - y1) >= min_height * h
    inside = x1 > margin and y1 > margin and x2 < w - margin and y2 < h - margin
    aspect = (y2 - y1) / max(x2 - x1, 1)
    return tall_enough and inside and conf >= min_conf and 1.2 <= aspect <= 5.0
