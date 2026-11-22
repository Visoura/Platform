# Visoura browser demo

Multi-camera person re-identification that runs entirely in the browser: YOLO11n detection,
tracking, ReID embedding with our transformer model, and watchlist matching, all on the
visitor's GPU through WebGPU. There's no server, so it can be hosted for free on GitHub Pages.
Videos and photos a visitor opens never leave their machine.

Branches:

- `flags-lab`: every optimization as a flag, with the slow baseline next to it and the
  ladder, isolated and leave-one-out benchmarks.
- `local-engine`: the fastest combination as a Python engine for real RTSP cameras on a Mac or
  an NVIDIA machine.
- `browser-demo` (this one): the same pipeline rewritten in TypeScript for the browser.

[LEARN.md](LEARN.md) explains how the browser version works and how it maps to the Python engine.

## What it needs

```
public/
  models/detector.onnx    YOLO11n, person class only, fp16          (about 5 MB)
  models/reid.onnx        the ReID transformer, fp16                (about 43 MB)
  videos/*.mp4            optional sample cameras + manifest.json
  persons/*.jpg           optional watchlist photos + manifest.json
```

All of it is generated from the same `data/` folder the Python branches use:

```
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r tools/requirements.txt
.venv/bin/python tools/prepare_web.py               # models + 640px 30fps videos + persons
.venv/bin/python tools/prepare_web.py --skip-media  # models only
```

The script exports both models to ONNX, keeps only the person outputs of the detector, and
converts them to fp16. LEARN.md shows how the export was checked against PyTorch.

## Run it locally

```
npm install
npm run dev          # http://localhost:5173
```

Use Chrome, Edge or Safari 26+ for WebGPU. Without it the page falls back to the CPU (WASM),
which works but only analyzes a few frames per second.

**Open videos** on the Live page plays any local video files as cameras instead of the
samples. **Search by photo** adds a watchlist person from an image.

## Publish on GitHub Pages

GitHub Pages is free for public repositories. An organization's private repository needs a
paid plan.

1. **Decide what to publish.** `public/models`, `public/videos` and `public/persons` are in
   `.gitignore`, so nothing is published by accident. Anything in them becomes downloadable by
   anyone:
   - **The ReID weights are required.** Without the models the page shows an error.
   - **Videos and photos are optional.** Visitors can open their own files. Only publish footage
     you have the rights to share.

   ```
   git add -f public/models                    # required
   git add -f public/videos public/persons     # optional sample media
   git commit -m "Add web models and sample media"
   ```

2. **Push the branch:** `git push origin browser-demo`.
3. **Set the Pages source.** In the repository on GitHub, go to Settings → Pages → Source and
   choose **GitHub Actions**.
4. **Allow this branch to deploy.** Go to Settings → Environments → `github-pages` → Deployment
   branches and add `browser-demo`. By default only the default branch may deploy.
5. **Run the workflow.** [.github/workflows/pages.yml](.github/workflows/pages.yml) runs on every
   push to `browser-demo`, or start it by hand from the Actions tab.

The site is then at `https://<owner>.github.io/<repo>/`.

Limits to keep in mind:

- 100 MB per file in git, so the fp16 models fit.
- About 1 GB per site.
- A soft limit of about 100 GB of traffic a month. A first visit that loads the models, the
  runtime and the sample videos is about 90 MB, so that's roughly a thousand first visits.
  Returning visitors are served from the browser cache.

## Layout

```
src/engine/
  engine.ts        main thread: videos, frame grabbing, in-flight limit, sightings, benchmark
  worker.ts        Web Worker: receives frames, runs the pipeline, answers clicks and photos
  pipeline.ts      detect → track → embed → match for one batch of camera frames
  models.ts        ONNX Runtime Web sessions (WebGPU, WASM fallback), model download
  preprocess.ts    letterbox and crop with OffscreenCanvas into planar float tensors
  detect.ts        YOLO output decoding and NMS
  tracker.ts       ByteTrack-style tracker
  tracks.ts        per-track embedding memory, hysteresis, crop quality gate
  targets.ts       watchlist and matching
  metrics.ts, sightings.ts, config.ts, types.ts
src/pages/         live.tsx, pipeline.tsx, benchmark.tsx
tools/prepare_web.py   exports the models and media into public/
```
