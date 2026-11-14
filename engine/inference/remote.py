import base64
import json
import os
import subprocess
import sys
import time

import cv2
import httpx
import msgpack
import numpy as np

from ..metrics import unwatch_process, watch_process
from ..settings import INFERENCE_PORT, REID_DIM, ROOT

JPEG_QUALITY = 80


def jpeg(image):
    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])[1].tobytes()


class RemoteModels:
    remote = True

    def __init__(self, flags, metrics):
        self.metrics = metrics
        self.binary = flags.inference_transport == "http_binary"
        env = {**os.environ, "ENGINE_FLAGS": json.dumps(flags.to_dict())}
        self.proc = subprocess.Popen([sys.executable, "-m", "engine.inference.server"], env=env, cwd=ROOT)
        watch_process(self.proc.pid)
        self.client = httpx.Client(base_url=f"http://127.0.0.1:{INFERENCE_PORT}", timeout=120)
        self._wait_ready()

    def _wait_ready(self):
        deadline = time.time() + 600
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("inference server exited during startup")
            try:
                if self.client.get("/health").json()["pid"] == self.proc.pid:
                    return
            except (httpx.HTTPError, KeyError, ValueError):
                pass
            time.sleep(0.3)
        raise RuntimeError("inference server did not start")

    def process(self, images):
        if self.binary:
            return self._process_binary(images)
        return self._process_json(images)

    def _process_json(self, images):
        with self.metrics.time("serialize"):
            body = {"frames": [base64.b64encode(jpeg(image)).decode() for image in images]}
        with self.metrics.time("remote_call"):
            response = self.client.post("/process_json", json=body)
            response.raise_for_status()
        with self.metrics.time("serialize"):
            boxes, embeddings = [], []
            for detections in response.json()["results"]:
                boxes.append(np.array([d["bbox"] + [d["confidence"]] for d in detections], np.float32).reshape(-1, 5))
                embeddings.append(np.array([d["embedding"] for d in detections], np.float32).reshape(-1, REID_DIM))
        return boxes, embeddings

    def _process_binary(self, images):
        with self.metrics.time("serialize"):
            body = msgpack.packb({"frames": [jpeg(image) for image in images]})
        with self.metrics.time("remote_call"):
            response = self.client.post("/process_binary", content=body)
            response.raise_for_status()
        with self.metrics.time("serialize"):
            data = msgpack.unpackb(response.content)
            boxes = [np.frombuffer(b, np.float32).reshape(-1, 5) for b in data["boxes"]]
            embeddings = [np.frombuffer(e, np.float16).astype(np.float32).reshape(-1, REID_DIM) for e in data["embs"]]
        return boxes, embeddings

    def embed_crops(self, crops):
        response = self.client.post("/embed_crops", content=msgpack.packb({"crops": [jpeg(c) for c in crops]}))
        response.raise_for_status()
        return np.frombuffer(response.content, np.float32).reshape(-1, REID_DIM)

    def close(self):
        unwatch_process(self.proc.pid)
        self.client.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
