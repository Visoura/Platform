import numpy as np


class Matcher:
    def __init__(self):
        self.ids = []
        self.matrix = np.zeros((0, 0), np.float32)

    def set_targets(self, ids, embeddings):
        self.ids = list(ids)
        self.matrix = np.asarray(embeddings, np.float32)

    def match(self, embeddings):
        if not self.ids or not len(embeddings):
            return [(None, 0.0)] * len(embeddings)
        with np.errstate(all="ignore"):
            scores = embeddings @ self.matrix.T
        best = scores.argmax(1)
        return [(self.ids[j], float(scores[i, j])) for i, j in enumerate(best)]
