# Visoura Platform

A small but complete multi-camera person re-identification system: live video from any
number of cameras, detection + tracking + ReID embedding + matching against a watchlist,
a live dashboard with click-to-track, and a benchmark.

This branch (`local-engine`) runs only the fastest combination of optimizations, with no
flags. [LEARN.md](LEARN.md) explains each piece, what it was worth, and what was dropped.

Branches:

- `flags-lab`: every optimization as a flag, with the slow baseline next to it and the
  ladder, isolated and leave-one-out benchmarks.
- `local-engine` (this one): the best combination, for real RTSP cameras on a Mac or an
  NVIDIA machine.
- `browser-demo`: the same pipeline running fully in the browser with WebGPU, for GitHub Pages.

```
data/videos/*.mp4 ─► MediaMTX (fake RTSP cameras: camN = main, camN_sub = 640px)
                         │                              │
                         │ RTSP                         │ WebRTC (video never touches Python)
                         ▼                              ▼
engine/  grab ─► detect ─► track ─► embed ─► match ─► publish ──ws──► frontend/
  (one Python process, FastAPI)                                  (React: Live, Pipeline, Benchmark)
data/persons/*.jpg ─► watchlist      data/sightings.db ◄─ sightings
```

## What you provide

```
data/
  videos/     one video file per camera, any number (mp4/mkv/mov/avi/ts)
  persons/    images of people to look for; the file name is the person's name.
              Already-cropped people or full photos both work.
  weights/    transformer_120.pth (ReID) and yolo11n.pt (detector)
```

`data/` is gitignored. Everything else is generated into `data/cache/` the first time you run:
a B-frame-free copy of each video (WebRTC can't carry B-frames), a 640px sub-stream, and
compiled CoreML/TensorRT models.

`python -m engine.tools.extract_persons cam1.mp4 --at 5 --count 3` saves people from a video
frame into `data/persons/`, which is handy for testing. The three `cam1_5s_*.jpg` files there now
were made this way and can be deleted.

## Start and stop

```
./run.sh          # engine + frontend in the background, then open http://localhost:5173
./stop.sh         # stops the engine (and the MediaMTX cameras it started) and the frontend
```

Logs and PID files go to `data/run/`. The first start takes a couple of minutes while the videos
are transcoded. Below is the one-time setup and what the scripts do by hand.

## Run it on a Mac (Apple Silicon)

```
brew install ffmpeg mediamtx
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-mac.txt
.venv/bin/python -m engine      # API on :8000, starts MediaMTX + the camera loops itself

cd frontend && npm install && npm run dev    # http://localhost:5173
```

The first start transcodes the videos (about 2 minutes for four 2-minute 1080p60 clips) and
then reuses the cache.

**WebRTC on macOS:** this was tested in Chrome on the same Mac and works out of the box. If the
tiles stay black (boxes still draw), the macOS application firewall
is probably blocking the Homebrew `mediamtx` binary. Click "Allow" if macOS asks, or run:

```
MTX=$(realpath $(which mediamtx))
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$MTX"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$MTX"
```

## Run it on an NVIDIA GPU (Linux)

```
sudo apt install ffmpeg
# MediaMTX: download the linux_amd64 tarball from github.com/bluenviron/mediamtx/releases, put it on PATH
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-cuda.txt
.venv/bin/python -m engine
```

On CUDA the detector is compiled with TensorRT (built once into `data/cache/`, with a PyTorch
fp16 fallback if that fails) and the GPU utilization tile is filled from NVML. The CUDA path
is written but has not been run yet. Only the Mac path was tested.

If the browser runs on another machine, point the frontend at the engine host in `frontend/.env`
(`VITE_API_URL`, `VITE_WEBRTC_URL`).

## Benchmark from the command line

```
.venv/bin/python -m engine.bench --frames 300        # all cameras
.venv/bin/python -m engine.bench --cameras 2         # first N cameras only
```

Reports are saved to `data/benchmarks/` and show up in the Benchmark page, so runs on different
machines can be compared side by side.

Settings that can be overridden with environment variables: `ANALYSIS_FPS` (default 10),
`MATCH_THRESHOLD` (0.8), `DEVICE` (cuda / mps / cpu), `RECORD=1` to record the main streams.

## Layout

```
engine/
  app.py, engine.py        HTTP + websocket API, pipeline lifecycle, clicks, benchmark runs
  settings.py              paths, ports and the few tuning constants
  pipeline/pipeline.py     the six stages
  pipeline/runners.py      three threads joined by bounded queues
  ingest/                  OpenCV RTSP reader, latest-frame wrapper, fps sampler
  inference/               detector (+ CoreML/TensorRT export), ReID model, GPU crops
  tracking/                ByteTrack wrapper, per-track embedding memory, quality gate
  matcher.py               watchlist matching as one matrix multiply
  sightings.py             batched SQLite writes
  metrics.py, bench.py     stage timers, counters, system stats; benchmark runner
frontend/src/
  pages/                   live.tsx, pipeline.tsx, benchmark.tsx
  lib/feed.ts              websocket feed, frame decoding, clock-synced latency
  lib/whep.ts              WebRTC (WHEP) player
```
