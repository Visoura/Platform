class FpsSampler:
    def __init__(self, analysis_fps):
        self.step = 1.0 / analysis_fps if analysis_fps > 0 else 0.0
        self.next_ts = 0.0

    def due(self, video_ts):
        if video_ts + 1e-6 < self.next_ts:
            return False
        self.next_ts = video_ts + self.step
        return True
