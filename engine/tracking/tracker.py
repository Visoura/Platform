import numpy as np
import supervision as sv
from trackers import ByteTrackTracker


class Tracker:
    def __init__(self, fps):
        self.tracker = ByteTrackTracker(frame_rate=fps, lost_track_buffer=int(fps), minimum_consecutive_frames=1,
                                        track_activation_threshold=0.5)

    def update(self, boxes):
        detections = sv.Detections(
            xyxy=boxes[:, :4].astype(np.float32),
            confidence=boxes[:, 4],
            class_id=np.zeros(len(boxes), int),
            data={"idx": np.arange(len(boxes))},
        )
        with np.errstate(all="ignore"):
            tracked = self.tracker.update(detections)
        keep = tracked.tracker_id >= 0
        return tracked.data["idx"][keep], tracked.tracker_id[keep]
