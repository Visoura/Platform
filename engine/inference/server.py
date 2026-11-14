import base64
import json
import os

import cv2
import msgpack
import numpy as np
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..flags import Flags
from ..settings import INFERENCE_PORT
from .local import LocalModels

models = LocalModels(Flags.from_dict(json.loads(os.environ.get("ENGINE_FLAGS", "{}"))))
app = FastAPI()


class Detection(BaseModel):
    bbox: list[float]
    confidence: float
    embedding: list[float]


class ProcessRequest(BaseModel):
    frames: list[str]


class ProcessResponse(BaseModel):
    results: list[list[Detection]]


def decode(data):
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


@app.get("/health")
def health():
    return {"pid": os.getpid()}


@app.post("/process_json", response_model=ProcessResponse)
def process_json(request: ProcessRequest):
    images = [decode(base64.b64decode(f)) for f in request.frames]
    boxes, embeddings = models.process(images)
    return ProcessResponse(results=[
        [Detection(bbox=b[:4].tolist(), confidence=float(b[4]), embedding=e.tolist()) for b, e in zip(bs, es)]
        for bs, es in zip(boxes, embeddings)
    ])


@app.post("/process_binary")
async def process_binary(request: Request):
    images = [decode(f) for f in msgpack.unpackb(await request.body())["frames"]]
    boxes, embeddings = await run_in_threadpool(models.process, images)
    body = {"boxes": [b.tobytes() for b in boxes], "embs": [e.astype(np.float16).tobytes() for e in embeddings]}
    return Response(msgpack.packb(body), media_type="application/msgpack")


@app.post("/embed_crops")
async def embed_crops(request: Request):
    crops = [decode(f) for f in msgpack.unpackb(await request.body())["crops"]]
    embeddings = await run_in_threadpool(models.embed_crops, crops)
    return Response(embeddings.astype(np.float32).tobytes(), media_type="application/octet-stream")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=INFERENCE_PORT, log_level="warning")
