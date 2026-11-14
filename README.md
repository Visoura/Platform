# Visoura Platform

A small but complete multi-camera person re-identification system: live video from any
number of cameras, detection + tracking + ReID embedding + matching against a watchlist,
a live dashboard with click-to-track, and a benchmark that measures every optimization
on its own.

Every optimization is a flag. All flags off reproduces the old, slow design; turning them
on one by one walks to a production-style pipeline. [LEARN.md](LEARN.md) explains each one
and points at the file to read.

```
data/videos/*.mp4 ─► MediaMTX (fake RTSP cameras: camN = main, camN_sub = 640px)
                         │                              │
                         │ RTSP                         │ WebRTC (video never touches Python)
                         ▼                              ▼
engine/  grab ─► detect ─► track ─► embed ─► match ─► publish ──ws──► frontend/
  (one Python process, FastAPI)                                  (React: Live, Pipeline, Benchmark)
data/persons/*.jpg ─► watchlist      data/sightings.db ◄─ sightings      Qdrant (baseline matcher)
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

## Run it on a Mac (Apple Silicon)

```
brew install ffmpeg mediamtx
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-mac.txt
docker compose up -d            # Qdrant, only needed for the baseline matcher
.venv/bin/python -m engine      # API on :8000, starts MediaMTX + the camera loops itself

cd frontend && npm install && npm run dev    # http://localhost:5173
```

The first start transcodes the videos (about 2 minutes for four 2-minute 1080p60 clips) and
then reuses the cache.

**WebRTC on macOS:** this was tested in Chrome on the same Mac and works out of the box. If the
tiles stay black in `video_out = webrtc` mode (boxes still draw), the macOS application firewall
is probably blocking the Homebrew `mediamtx` binary. Click "Allow" if macOS asks, or run:

```
MTX=$(realpath $(which mediamtx))
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$MTX"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$MTX"
```

## Run it on an NVIDIA GPU (Linux)

```
sudo apt install ffmpeg          # needs a build with --enable-cuda / nvdec for hw_decode
# MediaMTX: download the linux_amd64 tarball from github.com/bluenviron/mediamtx/releases, put it on PATH
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-cuda.txt
docker compose up -d
.venv/bin/python -m engine
```

On CUDA, `hw_decode` uses NVDEC through ffmpeg, the compiled flags use TensorRT (engines are
built once into `data/cache/`), and the GPU utilization tile is filled from NVML. The CUDA
paths are written but have not been run yet. Only the Mac paths were tested.

If the browser runs on another machine, point the frontend at the engine host in `frontend/.env`
(`VITE_API_URL`, `VITE_WEBRTC_URL`).

## Benchmark from the command line

```
.venv/bin/python -m engine.bench --ladder --frames 300        # every step, cumulative
.venv/bin/python -m engine.bench --frames 300                 # flags in data/flags.json
.venv/bin/python -m engine.bench --ladder --cameras 2         # first N cameras only
```

Reports are saved to `data/bench/` and show up in the Benchmark page.

## Layout

```
engine/
  app.py, engine.py        HTTP + websocket API, pipeline lifecycle, clicks, benchmark runs
  flags.py                 every flag, its help text, availability rules, the ladder order
  pipeline/pipeline.py     the six stages; build_* picks baseline vs optimized per flag
  pipeline/runners.py      sequential vs pipelined execution
  ingest/                  readers (OpenCV, ffmpeg hw), latest-frame wrapper, fps sampler, motion gate
  inference/               detector, ReID model, CPU/GPU crops, CoreML/TensorRT, remote server/client
  tracking/                ByteTrack wrapper, per-track embedding memory, quality gate
  matching/                Qdrant matcher, in-memory matcher
  output/encoders.py       base64 JSON, binary frames, metadata only
  sightings.py             per-event vs batched SQLite writes
  metrics.py, bench.py     stage timers, counters, system stats; benchmark runner
frontend/src/
  pages/                   live.tsx, pipeline.tsx, benchmark.tsx
  lib/feed.ts              websocket feed, frame decoding, clock-synced latency
  lib/whep.ts              WebRTC (WHEP) player
```
