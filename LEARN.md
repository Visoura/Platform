# Learning guide

The engine starts as the old design (every flag off) and each flag replaces one slow piece
with the version production systems use. Read the two versions side by side, flip the flag,
and measure.

## How to study one optimization

1. Open the **Pipeline** page, flip one flag, press **Apply & restart**, and watch the tiles
   and the stage table change. Live numbers include waiting for the next frame, so they're
   noisy.
2. Run **Benchmark → current flags** before and after for a clean number. It reads the files
   as fast as possible, so the comparison is fair.
3. Read the files listed for that flag. [engine/pipeline/pipeline.py](engine/pipeline/pipeline.py)
   is the spine: `build_reader`, `build_models`, `build_matcher` and `build_writer` pick an
   implementation from the flags, and the six stage methods (`grab`, `detect`, `track`, `embed`,
   `match`, `publish`) contain the remaining branches.
4. **Benchmark → ladder** turns the flags on one at a time, cumulatively, in the order of
   [engine/flags.py](engine/flags.py) `LADDER`. Each bar shows what that one step added on
   top of everything before it.

How to read the benchmark columns:

- **fps** counts source frames consumed per second across all cameras, including frames
  decoded and then skipped.
- **rt cams** is fps divided by the cameras' native fps, i.e. how many cameras this
  configuration could keep up with live.
- **det, emb and match** are per analyzed frame. If an optimization changes them, it changed
  the results, not just the speed. That's how you spot accuracy trade-offs.

## Measured on this machine

Ladder on an Apple M5 Pro (MPS), 4 cameras of 1080p60, 300 frames each, cumulative steps.
Your numbers will differ. Re-run it on your NVIDIA machine, where TensorRT and NVDEC
change the picture.

| step | fps | speedup | rt cams | CPU % | det/f | emb/f | KB out/f | db commits |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 19.8 | 1.00× | 0.33 | 71 | 11.3 | 11.3 | 259 | 36 |
| http_binary | 20.6 | 1.04× | 0.34 | 66 | 11.3 | 11.3 | 259 | 36 |
| inprocess | 24.4 | 1.23× | 0.41 | 63 | 11.3 | 11.3 | 260 | 33 |
| person_only | 24.2 | 1.22× | 0.40 | 61 | 11.3 | 11.3 | 260 | 33 |
| vectorized_boxes | 27.9 | 1.41× | 0.47 | 63 | 11.3 | 11.3 | 260 | 31 |
| batch_cameras | 28.6 | 1.45× | 0.48 | 62 | 11.3 | 11.3 | 260 | 31 |
| fp16 | 41.1 | 2.08× | 0.69 | 90 | 11.3 | 11.3 | 260 | 14 |
| compiled_detector | 35.0 | 1.77× | 0.58 | 94 | 12.6 | 12.6 | 260 | 17 |
| gpu_crops | 45.1 | 2.28× | 0.75 | 76 | 12.6 | 12.6 | 260 | 10 |
| compiled_embedder | 43.4 | 2.20× | 0.72 | 84 | 12.6 | 12.6 | 260 | 12 |
| tracker | 43.0 | 2.17× | 0.72 | 86 | 12.6 | 10.6 | 259 | 11 |
| embed_per_track | 78.7 | 3.98× | 1.31 | 114 | 12.6 | 0.4 | 259 | 8 |
| quality_gate | 78.8 | 3.99× | 1.31 | 123 | 12.6 | 0.3 | 259 | 8 |
| matcher_memory | 83.3 | 4.22× | 1.39 | 125 | 12.6 | 0.3 | 259 | 8 |
| hw_decode | 77.0 | 3.90× | 1.29 | 107 | 12.6 | 0.3 | 259 | 7 |
| use_substream | 118.8 | 6.01× | 1.98 | 103 | 11.9 | 0.3 | 49 | 7 |
| analysis_fps_10 | 543.2 | 27.48× | 9.06 | 108 | 11.9 | 1.6 | 49 | 5 |
| motion_gate | 522.5 | 26.43× | 8.72 | 95 | 11.8 | 1.6 | 49 | 9 |
| ws_binary | 525.4 | 26.58× | 8.76 | 109 | 11.8 | 1.6 | 37 | 10 |
| webrtc | 550.5 | 27.85× | 9.18 | 128 | 11.8 | 1.6 | 1 | 9 |
| batched_db_writes | 552.7 | 27.96× | 9.22 | 108 | 11.8 | 1.6 | 1 | 2 |
| pipelined | 541.1 | 27.37× | 9.03 | 122 | 11.3 | 1.6 | 1 | 2 |

How to read it:

- **The biggest wins come from not doing work at all:**
  - `embed_per_track`: 10 embeddings per frame become 0.4.
  - `use_substream`: 9× fewer pixels.
  - `analysis_fps`: analyze 1 frame in 6.
- **The "make each call faster" steps add up to about 2×:** `fp16`, `vectorized_boxes`,
  `gpu_crops`, the transport steps.
- **Some steps don't pay off on this Mac:**
  - `compiled_detector`: CoreML runs one image at a time.
  - `hw_decode`: the pipe copy costs more than the decode.
  - `motion_gate`: these scenes are busy.
  - `pipelined`: after `analysis_fps`, decoding the skipped frames dominates, so there's
    little left to overlap.

  Each one is explained below. Not every textbook optimization wins everywhere, so measure.
- **Two steps don't show up in fps but matter live:** `webrtc` (KB per frame to the browser
  drops from 259 to 1, and the video plays at full fps) and `batched_db_writes` (36 commits
  become 2).
- **det/f moves at `compiled_detector`:** the CoreML export finds slightly more boxes than the
  PyTorch model. That's precision drift, the kind of side effect to always check.

## Ingest

### `latest_frame_reader`
Read: [engine/ingest/cv2_reader.py](engine/ingest/cv2_reader.py) vs
[engine/ingest/latest_frame.py](engine/ingest/latest_frame.py)

- **Baseline:** the pipeline asks for "the next frame". If it processes 5 batches per second
  while the cameras send 60, the unread frames pile up in socket buffers and in MediaMTX.
  What you see is always older footage, and the lag keeps growing until MediaMTX starts
  discarding packets. That's the `reader is too slow, discarding N frames` warning, and it
  shows up as smeared H.264 decode errors in the log.
- **Optimized:** a thread per camera keeps reading and keeps only the newest frame. The
  pipeline always works on "now" and skips everything older. Every live system does this.
- **Watch:** *Pipeline latency* and *Frames dropped / s*. It only matters live, so the
  benchmark ladder skips it.

### `hw_decode`
Read: [engine/ingest/ffmpeg_reader.py](engine/ingest/ffmpeg_reader.py)

- **What it does:** runs `ffmpeg -hwaccel videotoolbox` (Mac) or `-hwaccel cuda` (NVDEC) and
  reads raw BGR frames from its stdout.
- **On this Mac it's slower:** OpenCV's CPU decoder runs at about 2500 fps per stream on the
  M5 Pro, and copying 6 MB raw 1080p frames through a pipe costs more than decoding them.
- **The lesson:** hardware decode saves *CPU*, which is the real limit once you have 30+
  cameras. It doesn't give a single stream more fps. Compare the CPU % column, not just fps.
- **The production version is zero-copy:** NVDEC writes frames into GPU memory and TensorRT
  reads them there, with no copy back to the CPU (DeepStream, PyNvVideoCodec). This flag copies
  frames back, so it shows the CPU saving but not the zero-copy win.

### `use_substream`
Read: [engine/cameras.py](engine/cameras.py) (`transcode`, `mediamtx_config`) and
`build_reader` in pipeline.py

- **What it does:** analyzes the 640px sub-stream instead of the 1080p main stream. Real cameras
  send both; the main stream is recorded without decoding (`RECORD=1` turns this on in MediaMTX)
  and analytics runs on the small one.
- **Why it's faster:** decode, upload, crop and encode costs all drop about 9×.
- **What it costs:** small, distant people get fewer pixels.

### `analysis_fps`
Read: [engine/ingest/sampler.py](engine/ingest/sampler.py)

- **What it does:** analyzes at most N frames per second per camera. People don't move far in
  100 ms, and the tracker carries identities across the gaps.
- **Effect:** usually the biggest single win: 60 → 10 fps is 6× less detector and ReID work.
- **What it costs:** in the `ws_*` modes the live video also drops to N fps, because only
  analyzed frames are sent. That's the argument for `webrtc`, where video and analytics are
  decoupled.

### `motion_gate`
Read: [engine/ingest/motion_gate.py](engine/ingest/motion_gate.py)

- **What it does:** shrinks each frame to 64×36 grayscale and compares it with the frame at
  the last detection. If almost nothing changed, the detector is skipped and the previous
  result is reused. It still forces a detection every 2 s.
- **Where it pays off:** most real cameras look at empty corridors most of the day. On busy
  test videos it rarely triggers, which is itself worth seeing. Watch *detector skipped / s*.

## Inference transport

### `inference_transport`: `http_json` → `http_binary` → `inprocess`
Read: [engine/inference/remote.py](engine/inference/remote.py),
[engine/inference/server.py](engine/inference/server.py) vs
[engine/inference/local.py](engine/inference/local.py)

- **`http_json`** is the old vision-pipeline:
  - The caller encodes each frame as JPEG and then base64 (33% bigger), and sends it as JSON.
  - The server decodes it, runs the models, and builds a Pydantic object for every
    embedding float.
  - The response goes back as JSON text and is parsed into floats again.

  The *serialize* and *remote_call* sub-stages show the cost.
- **`http_binary`:** the same process boundary with msgpack, raw JPEG bytes and float16
  embeddings. Only the text overhead is gone.
- **`inprocess`:** frames stay as numpy arrays and the models run in the same process. Nothing
  is encoded at all.
- **When a separate service is right:** when inference must scale on other machines than
  ingest, or several pipelines share GPUs (Triton). Then use binary protocols (gRPC, shared
  memory), never base64 JSON.

## Detection

Read: [engine/inference/detector.py](engine/inference/detector.py),
[engine/inference/compile.py](engine/inference/compile.py)

### `person_only`
Passes `classes=[0]`, so NMS (non-maximum suppression) never sees the other 79 COCO classes.
It's a small win, but free.

### `vectorized_boxes`
- **Baseline:** `boxes_per_box` calls `box.xyxy[0].cpu()` for every box. Each call is a GPU→CPU
  copy *and a synchronization*: the CPU waits until the GPU has finished.
- **Optimized:** `boxes_vectorized` copies the whole `(N, 6)` tensor once.
- **The general rule:** touch the GPU in bulk, never element by element.

### `batch_cameras`
One `predict` call with every camera's frame instead of one call per camera. GPUs are fast at
large batches and slow at many small launches.

### `fp16`
- **What it does:** half precision for both models.
- **Why it's faster:** half the memory traffic, and tensor-core / Apple-GPU fp16 paths.
- **Accuracy:** ReID embeddings barely change (cosine ≥ 0.9997 against fp32, measured).

### `compiled_detector`
- **What it does:** exports YOLO to TensorRT (NVIDIA) or CoreML (Mac) once and caches it.
  Compilers fuse layers and pick kernels for a *fixed shape*.
- **On the Mac it's slower:** Ultralytics runs CoreML one image at a time, so it loses to a
  batched fp16 MPS call. Compiling isn't automatically faster.
- **On NVIDIA:** TensorRT with a dynamic batch is normally the fastest option there is.

### `imgsz` (knob)
Detector input resolution. At 416 instead of 640, YOLO11n found 8 people instead of 13 in a
test frame. Watch *det* in the benchmark table.

## Tracking and embedding

### `tracker`
Read: [engine/tracking/tracker.py](engine/tracking/tracker.py)

- **What it does:** ByteTrack, from the `trackers` package. It predicts where each box moves
  with a Kalman filter and assigns detections to existing tracks by IoU (box overlap), giving
  each person a stable `track` id.
- **No speedup on its own.** What it fixes is flicker. Without it, matching is decided frame by
  frame, so a score dipping under the threshold for one frame drops the label. With it, a track
  that's already matched only needs `threshold - 0.1` to keep its label: hysteresis, in
  `TrackMemory.assign` in [engine/tracking/tracks.py](engine/tracking/tracks.py).
- **It also unlocks** the next optimization.

### `embed_per_track`
Read: `TrackMemory` in [engine/tracking/tracks.py](engine/tracking/tracks.py) and
`Pipeline._should_embed`

- **What it does:** a track is embedded when it first appears and then every 0.5 s. Its
  embedding is the normalized running mean of those samples.
- **Effect:** *emb* per frame drops from about 10 to about 0.3, so the ReID model does a
  fraction of the work.
- **Accuracy:** averaging also improves it, because one blurry frame no longer decides who
  somebody is.

### `gpu_crops`
Read: [engine/inference/crops.py](engine/inference/crops.py)

- **Baseline (`crops_cpu`):** for every person it slices the frame, converts BGR→RGB, builds a
  PIL image, resizes bicubically on the CPU, normalizes, and uploads that one crop to the GPU.
- **Optimized (`crops_gpu`):** uploads each frame once, then one `roi_align` call cuts and
  resizes every box on the GPU at the same time.
- **Trade-off:** the resampling is bilinear instead of bicubic, so embeddings differ very
  slightly (cosine ≥ 0.9987 against the CPU path, measured).

### `quality_gate`
Read: `good_crop` in [engine/tracking/tracks.py](engine/tracking/tracks.py)

- **What it does:** skips crops that are under 12% of the frame height, cut off at the frame
  edge, low-confidence, or a strange shape.
- **Why:** those embeddings are noise. They cost time and cause false matches. Watch
  `quality_skipped` in the rates.

### `compiled_embedder`
Read: [engine/inference/coreml_reid.py](engine/inference/coreml_reid.py),
[engine/inference/tensorrt_reid.py](engine/inference/tensorrt_reid.py), and `reid_coreml` /
`reid_tensorrt` in compile.py

- **What it does:** exports the ReID model once (CoreML, or ONNX → TensorRT).
- **Fixed shapes matter:**
  - CoreML with a variable batch size ran at 53 crops/s on this Mac.
  - A fixed batch of 32, zero-padded, ran at about 2775 crops/s.
  - fp16 PyTorch on MPS ran at about 2600 crops/s.

  TensorRT uses an optimization profile (min 1 / typical 32 / max 128) for the same reason.
- **In the pipeline it's slightly slower on this Mac anyway:** a frame batch has about 12
  people, so every call pads up to 32 and wastes most of the work. Exporting a few fixed
  sizes (8, 16, 32) and picking the smallest one that fits would fix that.

## Matching

### `matcher`: `qdrant` → `memory`
Read: [engine/matching/qdrant.py](engine/matching/qdrant.py) vs
[engine/matching/memory.py](engine/matching/memory.py)

- **Baseline:** every frame sends its embeddings to a vector database over HTTP to compare
  them with a handful of tracked people.
- **Optimized:** `embeddings @ targets.T`, one matrix multiply that takes microseconds.
- **When to use a vector database:** search over *millions* of stored appearances ("where was
  this person last week?"), not live matching against a watchlist of 10.

### `match_threshold` (knob)
- **What it is:** the cosine similarity needed to call a detection a tracked person.
- **Too low** gives false matches. Watch *match* per frame and the labels in the Live view.
- **Too high** means people are never recognized.
- **What we measured on these videos:**
  - The same person half a second later scored 0.88–0.96.
  - The best *wrong* person in a frame usually scored 0.6–0.8, with a maximum of 0.77
    between two different people in one frame.

  Hence the 0.8 default. With the 0.1 hysteresis, an already-matched track keeps its label
  down to 0.7.
- **Cross-camera matches score lower than same-camera ones**, because viewpoint and lighting
  change. That gap is exactly what a better ReID model closes, so this knob is where your
  training work shows up in the demo.

## Output

### `video_out`: `ws_base64` → `ws_binary` → `webrtc`
Read: [engine/output/encoders.py](engine/output/encoders.py),
[frontend/src/lib/feed.ts](frontend/src/lib/feed.ts),
[frontend/src/lib/whep.ts](frontend/src/lib/whep.ts),
[frontend/src/components/camera-tile.tsx](frontend/src/components/camera-tile.tsx)

- **`ws_base64`** is the old design: every analyzed frame is JPEG-encoded in Python, base64'd
  into JSON, and decoded byte by byte with `atob` in the browser.
- **`ws_binary`:** the same JPEG, sent as a binary websocket message (a 4-byte header length,
  a JSON header, then JPEG bytes). It's 33% smaller and needs no text decoding.
- **`webrtc`:** the browser pulls H.264 straight from MediaMTX over WebRTC (WHEP, a simple HTTP
  handshake for starting WebRTC playback). Python sends only box metadata. The video plays at
  the camera's full fps regardless of `analysis_fps`, and the encode stage disappears.

  **Trade-off:** boxes are drawn on whatever video frame is showing, so they trail the video by
  roughly the pipeline latency. Production systems fix that by matching RTP timestamps with
  `requestVideoFrameCallback`.
- **The hub drops a slow browser's oldest messages** instead of letting the whole server block.
  Watch *msgs dropped*.

## System

### `batched_db_writes`
Read: [engine/sightings.py](engine/sightings.py)

- **Baseline:** one `commit` per sighting event, which means one fsync to disk, inside the
  pipeline thread.
- **Optimized:** a background thread writes everything every 0.5 s in one transaction. Watch
  *db commits* in the benchmark.

### `pipelined`
Read: [engine/pipeline/runners.py](engine/pipeline/runners.py)

- **Sequential:** grab → infer → publish, one after another. The GPU idles while frames are read
  and encoded.
- **Pipelined:** three threads joined by queues holding at most 2 items each, so decode, GPU
  work and encoding overlap.
- **Why the queues are bounded:** a full queue makes the stage before it wait, so a slow stage
  slows the producer instead of piling up memory.
- **The gain is largest when stages are similar in size.** When one stage dominates, overlap
  can only hide the smaller ones.

## What a bigger production system adds on top

- **Zero-copy GPU pipelines:** decode → preprocess → TensorRT → tracker without frames ever
  leaving GPU memory (NVIDIA DeepStream, Savant).
- **Many processes and machines:**
  - ingest workers per group of cameras
  - a message bus (NATS, Kafka) carrying *metadata*, never video
  - inference servers (Triton) shared by several pipelines
- **Retrospective search:** store each track's averaged embedding with camera and time in a
  vector database, and search by photo across hours of history.
- **Recording** of the main stream without re-encoding (`RECORD=1` here), with retention
  policies.
- **Auth, TLS, health checks and alerting** on the metrics this engine already collects.
