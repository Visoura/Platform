# Learning guide

This branch runs one fixed design: the combination that measured fastest. The `flags-lab`
branch has every optimization as a flag, the slow baseline next to each one, and the benchmark
modes that produced the numbers below. Go there to flip things on and off. Read this branch to
see the result clean.

## The pipeline in one picture

```
 thread 1: grab              thread 2: models                                  thread 3: publish
 ───────────────             ──────────────────────────────────────────────    ─────────────────
 RTSP sub-stream  ──queue──► detect ─► track ─► embed (new tracks) ─► match ──queue──► boxes → websocket
 newest frame only           1 batch    ByteTrack  GPU crops + fp16      matrix         sightings → SQLite
 10 fps sampler              fp16       ids        every 0.5 s / track   multiply       (batched)
```

The browser plays the video itself over WebRTC from MediaMTX. Python only sends boxes.

[engine/pipeline/pipeline.py](engine/pipeline/pipeline.py) is the spine. Its six methods
(`grab`, `detect`, `track`, `embed`, `match`, `publish`) are the six stages, in order.

## Why each piece is here

The numbers come from the lab's *leave-one-out* benchmark: everything on, then one optimization
turned off at a time. "2.19×" means the finished system runs 2.19× faster with it than without
it. Apple M5 Pro, 4 cameras of 1080p60. Re-measure on your own hardware.

| piece | in the final system | where |
|---|---:|---|
| analyze 10 fps, not 60 | 2.98× | [ingest/sampler.py](engine/ingest/sampler.py) |
| fp16 for both models | 2.19× | [inference/detector.py](engine/inference/detector.py), [reid.py](engine/inference/reid.py) |
| 640px sub-stream | 1.86× | [cameras.py](engine/cameras.py) |
| models in the same process | 1.50× | [inference/models.py](engine/inference/models.py) |
| all cameras in one detector call | 1.17× | `Detector.detect` |
| in-memory matcher | 1.16× | [matcher.py](engine/matcher.py) |
| compiled detector (CoreML / TensorRT) | 1.09× | [inference/compile.py](engine/inference/compile.py) |
| three pipelined threads | 1.09× | [pipeline/runners.py](engine/pipeline/runners.py) |
| embed each track every 0.5 s, not every box | 1.07× (3.11× alone) | [tracking/tracks.py](engine/tracking/tracks.py) |
| ByteTrack | 1.03× | [tracking/tracker.py](engine/tracking/tracker.py) |
| GPU crops (`roi_align`) | 1.02× | [inference/crops.py](engine/inference/crops.py) |
| crop quality gate | 1.00×, but fewer false matches | `good_crop` in tracks.py |
| WebRTC video, boxes-only websocket | 1.00× in fps, 259 → 1 KB per frame | [frontend/src/lib/whep.ts](frontend/src/lib/whep.ts) |
| batched SQLite writes | 1.00× in fps, 36 → 2 commits | [sightings.py](engine/sightings.py) |
| latest-frame reader | live only | [ingest/latest_frame.py](engine/ingest/latest_frame.py) |

Together: about 20 → 600 source frames per second, roughly 10 real-time 60 fps cameras.

### grab

- **Sub-stream.** Real cameras send two streams: a full-resolution one that gets recorded
  without decoding (`RECORD=1` turns this on in MediaMTX), and a small one for analytics. 640px
  has about 9× fewer pixels to decode, copy and crop than 1080p.
- **Latest-frame reader.** A thread per camera keeps reading and holds only the newest frame. If
  the pipeline falls behind, it skips old frames instead of drifting further and further behind
  live. Watch *Frames dropped / s* on the Pipeline page.
- **10 fps sampler.** Frames 16 ms apart are nearly identical. People don't move far in 100 ms,
  and the tracker carries identities across the gaps. This is the single biggest saving, and
  production systems (DeepStream's `interval`) do the same.

### detect

- **One batched call** for every camera's frame. GPUs are fast at large batches and slow at many
  small launches.
- **fp16** halves memory traffic. ReID embeddings barely change (cosine ≥ 0.9997 against fp32).
- **Person class only** (`classes=[0]`), so NMS never sees the other 79 COCO classes.
- **Compiled** to CoreML on a Mac or TensorRT on NVIDIA, exported once into `data/cache/`. If the
  export fails, the detector falls back to PyTorch fp16 and says so in the log.
- **Boxes come back in one GPU→CPU copy** (`boxes.data`), never box by box. Each separate copy is
  also a sync point where the CPU waits for the GPU.

### track

ByteTrack predicts where each box moves and assigns new detections to existing tracks by box
overlap. On its own it saves nothing, but it's what makes the next two steps possible:

- embedding per person instead of per box
- a match that doesn't flicker: a track that already has a label only needs `threshold - 0.1`
  to keep it (`TrackMemory.assign`)

### embed

- **Per track, not per box.** A track is embedded when it first appears and then every 0.5 s.
  Its identity is the normalized running mean of those samples. That's about 1.5 embeddings per
  analyzed frame instead of about 12. Averaging also helps accuracy, because one blurry frame no
  longer decides who someone is.
- **Quality gate.** Crops that are tiny, cut off at the frame edge, low-confidence or oddly
  shaped are skipped. Their embeddings are noise.
- **GPU crops.** Each frame is uploaded once, and one `roi_align` call cuts and resizes every box
  on the GPU.

### match

`embeddings @ targets.T`, one matrix multiply. A vector database is for searching millions of
stored appearances, not for matching against a watchlist of ten.

`MATCH_THRESHOLD` (default 0.8, can be overridden with an environment variable):

- On these videos the same person scored 0.88–0.96 half a second later.
- The best *wrong* person reached at most 0.77.
- Cross-camera matches score lower, because viewpoint and lighting change. That gap is where a
  better ReID model shows up.

### publish

- **Boxes only, as JSON**, about 1 KB per frame. The browser plays H.264 straight from MediaMTX
  over WebRTC, at the camera's full frame rate, independent of the 10 fps analysis.
- **Trade-off:** boxes are drawn on whatever video frame is on screen, so they trail people by
  about the pipeline latency (about 45 ms here).
- **The hub drops a slow browser's oldest messages** instead of blocking the pipeline.
- **Sightings** are written by a background thread every 0.5 s in one transaction.

### Three threads

grab, models and publish run in separate threads joined by queues of at most 2 items. Decoding
the next batch overlaps with inference on the current one. The queues are bounded so a slow stage
makes the one before it wait, instead of piling up memory.

## What was tried and dropped

All of these are still in the `flags-lab` branch.

| dropped | speed of the final system with it | why it lost here |
|---|---:|---|
| motion gate (skip the detector when nothing moved) | 0.98× | At 10 fps frames differ too much in busy scenes. It helps at full frame rate, or on quiet cameras. |
| ffmpeg hardware decode | 0.98× | The CPU decoder does about 2500 fps per 1080p stream on this Mac, and the pipe copy costs more. On NVIDIA with many cameras it saves CPU, but only zero-copy NVDEC → TensorRT really wins. |
| compiled ReID (CoreML with batch padded to 32) | 0.94× | About 2 crops per call get padded to 32. Fixed sizes like 4, 8 and 16 would fix it. |
| Qdrant matcher | 0.86× | A network round trip per frame to compare against a few vectors. |
| models behind an HTTP service | 0.67× | JPEG + base64 + JSON on every frame. A separate service only makes sense with binary transport (gRPC, shared memory, Triton). |
| JPEG frames over the websocket | 1.00×, but 259 KB per frame | WebRTC sends the video directly. |

## What is left to optimize

From the benchmark, in milliseconds per analyzed frame: grab about 2.5–5.6 (decoding the
sub-stream, including skipped frames), detect about 5.1, embed about 4 (reid about 3.2). All
three are mostly fixed per-call overhead, not math. Next steps would be:

1. **Skip decoding frames you never analyze.** Ask cameras for a 10 fps sub-stream, or decode
   cameras in parallel.
2. **Call YOLO directly** instead of through `ultralytics.predict`: GPU letterbox, one forward
   pass, `torchvision.ops.batched_nms`.
3. **Fixed ReID batch sizes plus CUDA graphs** on NVIDIA.
4. **Zero-copy GPU decode** into the models (DeepStream, PyNvVideoCodec).

## What a bigger production system adds

- Ingest workers per group of cameras, a message bus (NATS, Kafka) carrying metadata, never
  video, and shared inference servers (Triton).
- Retrospective search: store each track's averaged embedding with camera and time in a vector
  database and search by photo across hours of history.
- Recording with retention policies, auth, TLS, health checks, and alerting on the metrics this
  engine already collects.
