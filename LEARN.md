# Learning guide

This branch is the `local-engine` pipeline moved into a web page. The stages and the ideas
are the same. What changes is where each one runs and which tools do the work.

## The pipeline in one picture

```
 page (main thread)                         Web Worker                                page
 ──────────────────                         ──────────────────────────────────────    ─────────────
 <video> per camera ─ every 100 ms ──────►  detect ─► track ─► embed ─► match  ─────► canvas boxes
 createImageBitmap at 640px                 1 batch   ByteTrack- new tracks  dot       sightings,
 (≤ 2 batches in flight)   (transferred,    WebGPU    style      fp16 ReID   product   alerts
                            not copied)     fp16                 every 0.5 s
```

## Python engine → browser

| stage | `local-engine` (Python) | `browser-demo` (TypeScript) |
|---|---|---|
| video in | RTSP sub-stream through OpenCV | `<video>` elements. The browser decodes on the GPU for free |
| sub-stream | a 640px transcode served by MediaMTX | `createImageBitmap(video, {resizeWidth: 640})` |
| latest-frame reader | a thread per camera keeps the newest frame | a 100 ms timer. If 2 batches are already in flight the tick is dropped |
| 10 fps | `FpsSampler` | the timer interval, `ANALYSIS_FPS` in [config.ts](src/engine/config.ts) |
| pipelined threads | grab / models / publish threads with queues | page grabs while the worker infers the previous batch |
| detector | Ultralytics + CoreML / TensorRT fp16 | ONNX Runtime Web, WebGPU, fp16 ONNX |
| person class only | `classes=[0]` | the exported model only outputs xywh + person score ([tools/prepare_web.py](tools/prepare_web.py)) |
| NMS | inside Ultralytics | [detect.ts](src/engine/detect.ts), on the few boxes above 0.4 |
| tracker | ByteTrack (`trackers` package, Kalman filter) | [tracker.ts](src/engine/tracker.ts): ByteTrack's two-pass matching with a smoothed velocity instead of a Kalman filter |
| GPU crops | `roi_align` | `drawImage(image, box → 128×256)` on an OffscreenCanvas |
| ReID | PyTorch fp16 | ONNX Runtime Web, WebGPU, fp16 |
| embed per track, quality gate, hysteresis | `tracking/tracks.py` | [tracks.ts](src/engine/tracks.ts), line for line |
| matching | numpy matrix multiply | dot products in [targets.ts](src/engine/targets.ts) |
| video out | WebRTC from MediaMTX, boxes over websocket | the `<video>` is already on the page; boxes are drawn on a canvas on top |
| sightings | SQLite, batched writes | in memory, [sightings.ts](src/engine/sightings.ts) |

## Things that only exist in the browser version

### Why a Web Worker

Model inference awaits the GPU, but preprocessing loops over every pixel in JavaScript. On the
main thread that would freeze scrolling and the video. The worker keeps the page smooth.

[worker.ts](src/engine/worker.ts) also runs every message one after another (the `queue`
promise chain), so a click never runs a model while a batch is mid-flight.

### Zero-copy hand-off

`createImageBitmap` produces a GPU-backed bitmap. `postMessage(..., [bitmap])` *transfers* it
to the worker instead of copying the pixels. This is the browser version of keeping frames in
GPU memory between decode and inference.

### Two batches in flight

The page grabs batch N+1 while the worker still runs batch N, like the pipelined threads.
Allowing more would only build a queue, and the boxes would trail the video by more and more.
Allowing fewer leaves the GPU idle while the page grabs. Watch *Frames dropped / s* on the
Pipeline page: if it's above zero, the models can't keep up with 10 fps for this many cameras.

### fp16 ONNX and the export pitfalls

Both models are exported once by `tools/prepare_web.py`. Three things in that script are worth
reading:

1. **The detector output is cut to `[batch, 5, anchors]`** (box + person score) with a `Slice`
   node. That's 17× less data to read back from the GPU than the full 84 rows, and the browser
   version of `classes=[0]`.
2. **`onnxslim` runs before the fp16 conversion.** It constant-folds the `Cast` nodes the
   PyTorch exporter puts inside attention. Without it the converter produces a model that fails
   to load.
3. **The model's own `Cast → float32` nodes are switched to `float16`** after conversion. The
   converter leaves them alone, which breaks the types around the dynamic-shape parts of the
   YOLO head.

### Checking the export

The exported fp16 models were checked against the PyTorch originals on these videos:

- **ReID:** cosine similarity between ONNX fp16 and PyTorch fp32 embeddings was ≥ 0.9998.
- **Detector:** the same number of people as Ultralytics on every test frame, with matching box
  IoU ≥ 0.975.

### WASM fallback

Without WebGPU, `models.ts` creates the sessions on the `wasm` backend (the CPU). fp16 models
on a single-threaded CPU are slow. ReID takes about 2 s per batch on the M5 Pro, so only a few
frames per second get analyzed. Two things would speed it up:

- fp32 copies of the models for the CPU path
- multi-threaded WASM, which needs cross-origin isolation headers that GitHub Pages can't set

## Measured on this machine

Apple M5 Pro, Chrome, 4 cameras, Benchmark page with 40 frames per camera:

| | browser (WebGPU) | Python (`local-engine`, MPS + CoreML) |
|---|---:|---:|
| analyzed frames / s | 126 | 106 analyzed while also decoding 600 source fps |
| detect, ms per frame | 4.0 | 5.1 |
| embed, ms per frame | 3.9 (crop 0.8, reid 3.1) | 4.0 (crop 0.8, reid 3.2) |
| cameras at 10 fps | about 12 | about 10 at 60 fps source |

The two numbers measure slightly different things:

- The browser benchmark starts from frames that are already decoded and resized; the browser's
  media pipeline does that work.
- The Python benchmark includes decoding every 60 fps source frame.

The model work per frame is about the same, which is the point: WebGPU with fp16 ONNX is not a
toy runtime. Live, the page runs 4 cameras at the full 10 fps with about 40 ms from grab to boxes.

## Where the browser version can go next

- **Preprocess on the GPU.** Letterboxing and crops still go through `getImageData` and a
  JavaScript loop. A WebGPU compute shader could write the input tensor directly, and ONNX
  Runtime Web accepts GPU buffers as inputs.
- **Cache the models.** Storing them with the Cache Storage API would make returning visits
  instant even after the HTTP cache expires.
- **Sync boxes to frames.** `requestVideoFrameCallback` gives the exact frame on screen, so
  boxes could be drawn on the frame they were computed on.
