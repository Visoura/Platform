import cv2
import numpy as np


class MotionGate:
    def __init__(self, threshold=1.5, max_skip_s=2.0):
        self.threshold = threshold
        self.max_skip_s = max_skip_s
        self.reference = None
        self.reference_ts = -1e9

    def moved(self, image, video_ts):
        small = cv2.cvtColor(cv2.resize(image, (64, 36), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        small = cv2.GaussianBlur(small, (3, 3), 0).astype(np.int16)
        stale = video_ts - self.reference_ts >= self.max_skip_s
        if self.reference is None or stale or np.abs(small - self.reference).mean() > self.threshold:
            self.reference = small
            self.reference_ts = video_ts
            return True
        return False
