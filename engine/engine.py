import re
import threading
import time
import traceback
import uuid

import cv2
import numpy as np

from . import bench, cameras, capabilities
from . import flags as flag_store
from .flags import normalize, schema
from .hub import Hub
from .metrics import Metrics
from .pipeline.pipeline import Pipeline
from .settings import PERSONS_DIR, WEBRTC_PORT
from .targets import TargetStore, thumbnail


class Engine:
    def __init__(self):
        self.cameras = cameras.scan()
        cameras.prepare(self.cameras)
        self.mediamtx = cameras.start_mediamtx(self.cameras)
        self.caps = capabilities.detect()
        self.flags = normalize(flag_store.load(), self.caps)
        self.metrics = Metrics()
        self.hub = Hub()
        self.targets = TargetStore()
        self.pipeline = None
        self.thread = None
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.status = "starting"
        self.error = None
        self.clicks = {}
        self.bench = {"running": False, "step": None, "index": 0, "total": 0, "report": None, "error": None}
        self.bench_cancel = False
        threading.Thread(target=self._tick, daemon=True).start()

    def _tick(self):
        while True:
            time.sleep(1)
            self.metrics.tick()

    def start(self):
        with self.lock:
            self._start()

    def _start(self):
        self.status, self.error = "starting", None
        try:
            self.metrics.reset()
            self.pipeline = Pipeline(self.flags, self.cameras, self.metrics, self.targets, hub=self.hub)
            self.targets.load_watchlist(self.pipeline.models)
        except Exception as e:
            traceback.print_exc()
            self.status, self.error, self.pipeline = "error", str(e), None
            return
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, args=(self.pipeline, self.stop_event), daemon=True)
        self.thread.start()
        self.status = "running"

    def _run(self, pipeline, stop):
        try:
            pipeline.run(stop)
        except Exception as e:
            traceback.print_exc()
            self.status, self.error = "error", str(e)

    def _stop(self):
        if self.thread:
            self.stop_event.set()
            self.thread.join(timeout=10)
            self.thread = None
        if self.pipeline:
            self.pipeline.close()
            self.pipeline = None
        self.status = "stopped"

    def apply_flags(self, data):
        with self.lock:
            self.caps = capabilities.detect()
            self.flags = normalize(flag_store.Flags.from_dict({**self.flags.to_dict(), **data}), self.caps)
            flag_store.save(self.flags)
            self._stop()
            self._start()

    def state(self):
        return {
            "status": self.status,
            "error": self.error,
            "cameras": [c.to_dict() for c in self.cameras],
            "flags": self.flags.to_dict(),
            "schema": schema(self.flags, self.caps),
            "capabilities": self.caps,
            "webrtc_port": WEBRTC_PORT,
            "bench_running": self.bench["running"],
        }

    def click(self, camera, index, x, y):
        pipeline = self.pipeline
        frame = pipeline.frame_at(camera, index) if pipeline else None
        if frame is None:
            return {"status": "no_frame"}
        h, w = frame.image.shape[:2]
        px, py = x * w, y * h
        hits = [d for d in frame.dets if d.box[0] <= px <= d.box[2] and d.box[1] <= py <= d.box[3]]
        hits.sort(key=lambda d: (d.box[2] - d.box[0]) * (d.box[3] - d.box[1]))
        if not hits:
            return {"status": "no_detection"}
        crops = [frame.image[max(int(d.box[1]), 0):int(d.box[3]), max(int(d.box[0]), 0):int(d.box[2])] for d in hits]
        embeddings = [pipeline.track_embedding(camera, d) for d in hits]
        missing = [i for i, e in enumerate(embeddings) if e is None]
        if missing:
            for i, e in zip(missing, pipeline.models.embed_crops([crops[i] for i in missing])):
                embeddings[i] = e
        token = uuid.uuid4().hex
        self.clicks[token] = [(crop, emb, d.target) for crop, emb, d in zip(crops, embeddings, hits)]
        return {"status": "ok", "token": token, "candidates": [
            {"index": i, "box": [float(v) / s for v, s in zip(d.box[:4], (w, h, w, h))], "thumb": thumbnail(c),
             "target": d.target, "name": d.name}
            for i, (d, c) in enumerate(zip(hits, crops))]}

    def track(self, token, index, name=None):
        crop, embedding, existing = self.clicks.pop(token)[index]
        if existing and self.targets.get(existing):
            return self.targets.get(existing).to_dict()
        number = sum(1 for t in self.targets.snapshot() if t.source == "click") + 1
        return self.targets.add(name or f"person-{number}", "click", embedding, crop).to_dict()

    def add_photo(self, data, name):
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if image is None or not self.pipeline:
            raise ValueError("could not read image or pipeline not running")
        name = re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or f"photo_{uuid.uuid4().hex[:6]}"
        cv2.imwrite(str(PERSONS_DIR / f"{name}.jpg"), image)
        self.targets.load_watchlist(self.pipeline.models)
        return self.targets.get(f"w-{name}").to_dict()

    def start_bench(self, mode, frames):
        if self.bench["running"]:
            return False
        self.bench = {"running": True, "step": None, "index": 0, "total": 0, "report": None, "error": None}
        self.bench_cancel = False
        threading.Thread(target=self._bench, args=(mode, frames), daemon=True).start()
        return True

    def _bench(self, mode, frames):
        def progress(i, total, step):
            self.bench.update(index=i, total=total, step=step)

        with self.lock:
            self._stop()
            self.status = "benchmarking"
            try:
                self.bench["report"] = bench.run(mode, self.cameras, self.targets, frames, self.flags,
                                                 on_progress=progress, should_stop=lambda: self.bench_cancel)
            except Exception as e:
                traceback.print_exc()
                self.bench["error"] = str(e)
            self.bench["running"] = False
            self._start()

    def close(self):
        with self.lock:
            self._stop()
        if self.mediamtx:
            self.mediamtx.terminate()
