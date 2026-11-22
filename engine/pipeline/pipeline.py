import json
import time
from collections import deque

import numpy as np

from ..ingest.cv2_reader import Cv2Reader
from ..ingest.latest_frame import LatestFrameReader
from ..ingest.sampler import FpsSampler
from ..matcher import Matcher
from ..settings import ANALYSIS_FPS, MATCH_THRESHOLD, RECENT_FRAMES
from ..sightings import SightingLog, Writer
from ..tracking.tracker import Tracker
from ..tracking.tracks import TrackMemory, good_crop
from .frame import Detection, Frame
from .runners import DONE, run_pipelined

STAGES = ["grab", "detect", "track", "embed", "match", "publish"]


def open_reader(camera, live, metrics):
    if live:
        return LatestFrameReader(Cv2Reader(camera.sub_url, live=True), lambda: metrics.count("frames_dropped"))
    return Cv2Reader(str(camera.sub_file), live=False)


def one_match_per_target(dets):
    best = {}
    for d in dets:
        if d.target and (d.target not in best or d.score > best[d.target].score):
            best[d.target] = d
    for d in dets:
        if d.target and best[d.target] is not d:
            d.target, d.score, d.name = None, 0.0, None


class Pipeline:
    def __init__(self, cameras, metrics, targets, models, hub=None, live=True, max_frames=None, warmup=0):
        self.cameras = cameras
        self.metrics = metrics
        self.targets = targets
        self.models = models
        self.models.metrics = metrics
        self.hub = hub
        self.max_frames = max_frames
        self.warmup = warmup
        self.warmed = warmup == 0
        self.readers = {c.id: open_reader(c, live, metrics) for c in cameras}
        self.samplers = {c.id: FpsSampler(ANALYSIS_FPS) for c in cameras}
        self.trackers = {c.id: Tracker(ANALYSIS_FPS) for c in cameras}
        self.memory = {c.id: TrackMemory() for c in cameras}
        self.matcher = Matcher()
        self.targets_version = -1
        self.sightings = SightingLog(Writer(metrics), self._on_sighting)
        self.recent = {c.id: deque(maxlen=RECENT_FRAMES if live else 1) for c in cameras}
        self.finished = set()

    def run(self, stop):
        groups = [["grab"], ["detect", "track", "embed", "match"], ["publish"]]
        run_pipelined([[self._timed(name) for name in group] for group in groups], stop)

    def _timed(self, name):
        fn = getattr(self, name)

        def stage(item):
            if item is DONE:
                return DONE
            with self.metrics.time(name):
                return fn(item)
        return stage

    def grab(self, _):
        frames = []
        for camera in self.cameras:
            if camera.id in self.finished:
                continue
            frame = self._next_due_frame(camera)
            if frame is None:
                self.finished.add(camera.id)
            else:
                frames.append(frame)
        if not frames:
            return DONE
        if not self.warmed and min(f.index for f in frames) >= self.warmup:
            self.warmed = True
            self.metrics.reset()
        return frames

    def _next_due_frame(self, camera):
        while True:
            item = self.readers[camera.id].read()
            if item is None:
                return None
            index, image = item
            if self.max_frames and index >= self.max_frames:
                return None
            self.metrics.count("frames_decoded")
            video_ts = index / camera.fps
            if self.samplers[camera.id].due(video_ts):
                return Frame(camera.id, index, video_ts, time.time(), image)

    def detect(self, frames):
        for frame, boxes in zip(frames, self.models.detect([f.image for f in frames])):
            frame.dets = [Detection(box) for box in boxes]
            self.metrics.count("detections", len(boxes))
        return frames

    def track(self, frames):
        for frame in frames:
            boxes = np.stack([d.box for d in frame.dets]) if frame.dets else np.zeros((0, 5), np.float32)
            keep, track_ids = self.trackers[frame.camera].update(boxes)
            dets = frame.dets
            frame.dets = [dets[i] for i in keep]
            memory = self.memory[frame.camera]
            for d, track_id in zip(frame.dets, track_ids):
                d.track_id = int(track_id)
                memory.get(d.track_id).last_seen_ts = frame.video_ts
            memory.forget_older_than(frame.video_ts)
        return frames

    def _should_embed(self, frame, det):
        if not good_crop(det.box, frame.image.shape):
            self.metrics.count("quality_skipped")
            return False
        return self.memory[frame.camera].needs_embedding(det.track_id, frame.video_ts)

    def embed(self, frames):
        images, boxes, chosen = [], [], []
        for frame in frames:
            dets = [d for d in frame.dets if self._should_embed(frame, d)]
            if dets:
                images.append(frame.image)
                boxes.append(np.stack([d.box for d in dets]))
                chosen.append((frame, dets))
        for (frame, dets), embeddings in zip(chosen, self.models.embed(images, boxes)):
            memory = self.memory[frame.camera]
            for d, e in zip(dets, embeddings):
                d.embedding = memory.add_embedding(d.track_id, e, frame.video_ts)
            self.metrics.count("embeddings", len(dets))
        return frames

    def _sync_targets(self):
        if self.targets.version == self.targets_version:
            return
        self.targets_version = self.targets.version
        targets = self.targets.snapshot()
        self.matcher.set_targets([t.id for t in targets], [t.embedding for t in targets])

    def match(self, frames):
        self._sync_targets()
        names = {t.id: t.name for t in self.targets.snapshot()}
        fresh = [(f, d) for f in frames for d in f.dets if d.embedding is not None]
        results = self.matcher.match(np.stack([d.embedding for _, d in fresh])) if fresh and names else []
        for (frame, det), (target, score) in zip(fresh, results):
            self.memory[frame.camera].assign(det.track_id, target, score, MATCH_THRESHOLD)
        for frame in frames:
            for d in frame.dets:
                state = self.memory[frame.camera].get(d.track_id)
                if state.target in names:
                    d.target, d.score, d.name = state.target, state.score, names[state.target]
            one_match_per_target(frame.dets)
        return frames

    def publish(self, frames):
        now = time.time()
        for frame in frames:
            self.recent[frame.camera].append(frame)
            visible = {d.target: d.name for d in frame.dets if d.target}
            self.sightings.update(frame.camera, visible, now)
            message = json.dumps(frame.message())
            if self.hub:
                self.hub.publish(message)
            self.metrics.count("bytes_out", len(message))
            self.metrics.count("frames_analyzed")
            self.metrics.count("matched", len(visible))
            self.metrics.add_latency(time.time() - frame.ts)
        return frames

    def _on_sighting(self, camera, target_id, name):
        if self.hub:
            self.hub.publish(json.dumps({"type": "alert", "camera": camera, "target": target_id, "name": name,
                                         "ts": time.time() * 1000}))

    def frame_at(self, camera, index):
        frames = list(self.recent.get(camera, []))
        if not frames:
            return None
        exact = [f for f in frames if f.index == index]
        return exact[0] if exact else frames[-1]

    def track_embedding(self, camera, det):
        state = self.memory[camera].get(det.track_id)
        return state.embedding if state.embedding is not None else det.embedding

    def close(self):
        for reader in self.readers.values():
            reader.close()
        self.sightings.close()
