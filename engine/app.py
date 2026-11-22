import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import bench, sightings
from .engine import Engine

engine: Engine = None


@asynccontextmanager
async def lifespan(app):
    global engine
    engine = await run_in_threadpool(Engine)
    engine.hub.attach(asyncio.get_running_loop())
    asyncio.get_running_loop().run_in_executor(None, engine.start)
    yield
    await run_in_threadpool(engine.close)


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Click(BaseModel):
    camera: str
    index: int
    x: float
    y: float


class Track(BaseModel):
    token: str
    index: int
    name: str | None = None


class BenchRequest(BaseModel):
    frames: int = 300


@app.get("/api/state")
def state():
    return engine.state()


@app.get("/api/metrics")
def metrics():
    snap = engine.metrics.snapshot()
    snap["ws_bytes_sent"] = engine.hub.bytes_sent
    snap["ws_dropped"] = engine.hub.dropped
    snap["ws_clients"] = len(engine.hub.clients)
    return snap


@app.post("/api/click")
async def click(body: Click):
    return await run_in_threadpool(engine.click, body.camera, body.index, body.x, body.y)


@app.post("/api/targets")
def track(body: Track):
    if body.token not in engine.clicks:
        raise HTTPException(410, "selection expired, click again")
    return engine.track(body.token, body.index, body.name)


@app.post("/api/targets/photo")
async def photo(image: UploadFile = File(...), name: str = Form("")):
    data = await image.read()
    try:
        return await run_in_threadpool(engine.add_photo, data, name or image.filename.rsplit(".", 1)[0])
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/targets")
def targets():
    return [t.to_dict() for t in engine.targets.snapshot()]


@app.delete("/api/targets/{target_id}")
def untrack(target_id: str):
    engine.targets.remove(target_id)
    return {"status": "removed"}


@app.get("/api/targets/{target_id}/history")
def history(target_id: str):
    return sightings.history(target_id)


@app.post("/api/bench")
def start_bench(body: BenchRequest):
    if not engine.start_bench(body.frames):
        raise HTTPException(409, "a benchmark is already running")
    return engine.bench


@app.get("/api/bench")
def bench_status():
    return engine.bench


@app.get("/api/bench/reports")
def reports():
    return bench.reports()


@app.websocket("/ws")
async def ws(socket: WebSocket):
    await socket.accept()
    await engine.hub.serve(socket)
