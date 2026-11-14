import time
from collections import deque
from dataclasses import replace

import numpy as np

from ..ingest.cv2_reader import Cv2Reader
from ..ingest.ffmpeg_reader import FfmpegReader
from ..ingest.latest_frame import LatestFrameReader
from ..ingest.motion_gate import MotionGate
from ..ingest.sampler import FpsSampler
from ..matching.memory import MemoryMatcher
from ..output.encoders import build_encoder
from ..settings import RECENT_FRAMES
from ..sightings import BatchedWriter, SightingLog, SyncWriter
from ..tracking.tracker import Tracker
from ..tracking.tracks import TrackMemory, good_crop
from .frame import Detection, Frame
from .runners import DONE, run_pipelined, run_sequential

STAGES = ["grab", "detect", "track", "embed", "match", "publish"]


def build_reader(camera, flags, live, metrics):
    sub = flags.use_substream
    source = camera.url(sub) if live else str(camera.path(sub))
    if flags.hw_decode:
        reader = FfmpegReader(source, live, *camera.size(sub))
    else:
        reader = Cv2Reader(source, live)
    if flags.latest_frame_reader and live:
        reader = LatestFrameReader(reader, lambda: metrics.count("frames_dropped"))
    return reader


def build_models(flags, metrics):
    if flags.inference_transport == "inprocess":
        from ..inference.local import LocalModels
        return LocalModels(flags, metrics)
    from ..inference.remote import RemoteModels
    return RemoteModels(flags, metrics)


def build_matcher(flags):
    if flags.matcher == "qdrant":
        from ..matching.qdrant import QdrantMatcher
        return QdrantMatcher()
    return MemoryMatcher()


def build_writer(flags, metrics):
    return BatchedWriter(metrics) if flags.batched_db_writes else SyncWriter(metrics)


def one_match_per_target(dets):
    best = {}
    for d in dets:
        if d.target and (d.target not in best or d.score > best[d.target].score):
            best[d.target] = d
    for d in dets:
        if d.target and best[d.target] is not d:
            d.target, d.score = None, 0.0


class Pipeline:
    def __init__(self, flags, cameras, metrics, targets, hub=None, live=True, max_frames=None, warmup=0):
        self.flags = flags
        self.cameras = cameras
        self.metrics = metrics
        self.targets = targets
        self.hub = hub
        self.live = live
        self.max_frames = max_frames
        self.warmup = warmup
        self.warmed = warmup == 0
        self.models = build_models(flags, metrics)
        self.readers = {c.id: build_reader(c, flags, live, metrics) for c in cameras}
        self.samplers = {c.id: FpsSampler(flags.analysis_fps) for c in cameras}
        self.gates = {c.id: MotionGate() for c in cameras} if flags.motion_gate else {}
        self.trackers = {c.id: Tracker(flags.analysis_fps or c.fps) for c in cameras} if flags.tracker else {}
        self.memory = {c.id: TrackMemory() for c in cameras}
        self.matcher = build_matcher(flags)
        self.targets_version = -1
        self.encoder = build_encoder(flags.video_out)
        self.sightings = SightingLog(build_writer(flags, metrics), self._on_sighting)
        self.last_dets = {c.id: [] for c in cameras}
        self.recent = {c.id: deque(maxlen=RECENT_FRAMES if live else 1) for c in cameras}
        self.finished = set()

    def run(self, stop):
        groups = [["grab"], ["detect", "track", "embed", "match"], ["publish"]]
        groups = [[self._timed(name) for name in group] for group in groups]
        (run_pipelined if self.flags.pipelined else run_sequential)(groups, stop)

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
                break
        frame = Frame(camera.id, index, video_ts, time.time(), image)
        if self.gates and not self.gates[camera.id].moved(image, video_ts):
            frame.run_detector = False
            self.metrics.count("detector_skipped")
        return frame

    def detect(self, frames):
        run = [f for f in frames if f.run_detector]
        images = [f.image for f in run]
        if self.models.remote:
            boxes, embeddings = self.models.process(images)
        else:
            boxes, embeddings = self.models.detect(images), [None] * len(run)
        for frame, frame_boxes, frame_embeddings in zip(run, boxes, embeddings):
            frame.dets = [Detection(box, embedding=None if frame_embeddings is None else frame_embeddings[i])
                          for i, box in enumerate(frame_boxes)]
            self.metrics.count("detections", len(frame.dets))
        for frame in frames:
            if not frame.run_detector:
                frame.dets = [replace(d) for d in self.last_dets[frame.camera]]
        return frames

    def track(self, frames):
        if not self.trackers:
            return frames
        for frame in frames:
            if not frame.run_detector:
                continue
            boxes = np.stack([d.box for d in frame.dets]) if frame.dets else np.zeros((0, 5), np.float32)
            keep, track_ids = self.trackers[frame.camera].update(boxes)
            frame.dets = [replace(frame.dets[i], track_id=int(t)) for i, t in zip(keep, track_ids)]
            memory = self.memory[frame.camera]
            for d in frame.dets:
                memory.get(d.track_id).last_seen_ts = frame.video_ts
            memory.forget_older_than(frame.video_ts)
        return frames

    def _should_embed(self, frame, det):
        if self.flags.quality_gate and not good_crop(det.box, frame.image.shape):
            self.metrics.count("quality_skipped")
            return False
        if self.flags.embed_per_track and det.track_id is not None:
            return self.memory[frame.camera].needs_embedding(det.track_id, frame.video_ts)
        return True

    def embed(self, frames):
        if self.models.remote:
            self.metrics.count("embeddings", sum(len(f.dets) for f in frames if f.run_detector))
            return frames
        images, boxes, chosen = [], [], []
        for frame in frames:
            if not frame.run_detector:
                continue
            dets = [d for d in frame.dets if self._should_embed(frame, d)]
            if dets:
                images.append(frame.image)
                boxes.append(np.stack([d.box for d in dets]))
                chosen.append((frame, dets))
        embeddings = self.models.embed(images, boxes)
        for (frame, dets), frame_embeddings in zip(chosen, embeddings):
            for d, e in zip(dets, frame_embeddings):
                if self.flags.embed_per_track and d.track_id is not None:
                    e = self.memory[frame.camera].add_embedding(d.track_id, e, frame.video_ts)
                d.embedding = e
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
        threshold = self.flags.match_threshold
        fresh = [(f, d) for f in frames if f.run_detector for d in f.dets if d.embedding is not None]
        results = self.matcher.match(np.stack([d.embedding for _, d in fresh])) if fresh and names else []
        self.metrics.count("matcher_queries", len(results))
        for (frame, det), (target, score) in zip(fresh, results):
            if det.track_id is not None:
                self.memory[frame.camera].assign(det.track_id, target, score, threshold)
            elif target is not None and score >= threshold:
                det.target, det.score = target, score
        for frame in frames:
            if not frame.run_detector:
                continue
            for d in frame.dets:
                if d.track_id is not None:
                    state = self.memory[frame.camera].get(d.track_id)
                    d.target, d.score = state.target, state.score
                if d.target not in names:
                    d.target, d.score = None, 0.0
                d.name = names.get(d.target)
            one_match_per_target(frame.dets)
        return frames

    def publish(self, frames):
        now = time.time()
        for frame in frames:
            self.last_dets[frame.camera] = frame.dets
            self.recent[frame.camera].append(frame)
            visible = {d.target: d.name for d in frame.dets if d.target}
            with self.metrics.time("db"):
                self.sightings.update(frame.camera, visible, now)
            with self.metrics.time("encode"):
                message = self.encoder.encode(frame)
            if self.hub:
                self.hub.publish(message)
            self.metrics.count("bytes_out", len(message))
            self.metrics.count("frames_analyzed")
            self.metrics.count("matched", len(visible))
            self.metrics.add_latency(time.time() - frame.ts)
        return frames

    def _on_sighting(self, camera, target_id, name):
        if self.hub:
            self.hub.publish_json({"type": "alert", "camera": camera, "target": target_id, "name": name,
                                   "ts": time.time() * 1000})

    def frame_at(self, camera, index):
        frames = list(self.recent.get(camera, []))
        if not frames:
            return None
        exact = [f for f in frames if f.index == index]
        return exact[0] if exact else frames[-1]

    def track_embedding(self, camera, det):
        if det.track_id is not None:
            state = self.memory[camera].get(det.track_id)
            if state.embedding is not None:
                return state.embedding
        return det.embedding

    def close(self):
        for reader in self.readers.values():
            reader.close()
        self.models.close()
        self.matcher.close()
        self.sightings.close()
