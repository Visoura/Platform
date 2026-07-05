# Testing this end-to-end

This walks through standing up everything from scratch: the AI service
(only needed once, to preprocess your videos), the Django backend, and the
React frontend, then exercising the actual features in a browser.

## 0. Prerequisites

- Docker + Docker Compose
- Node.js (18+) for the frontend
- An NVIDIA GPU + drivers for the AI service (`vision-pipeline`) — it's only
  used during preprocessing, not while watching a session
- `ffmpeg` (optional) if you want to trim long source videos first — see
  "Disk usage" below, it matters more than you'd think

You need two repos checked out as siblings:

```
some-folder/
  Platform/          # this repo
  vision-pipeline/    # git@github.com:Visoura/vision-pipeline.git — the AI service
```

## 1. Start the AI service (vision-pipeline)

```
cd vision-pipeline
docker compose up --build
```

This serves `POST /process` on `localhost:3000`. It's the only thing that
ever calls a real GPU model — used exclusively by the preprocessing step
below. Once your cameras are preprocessed you can stop this container
entirely; live sessions never call it.

## 2. Start the Platform backend

```
cd Platform/backend
cp .env.example .env
docker compose up --build
```

This brings up Postgres, Redis, Qdrant, and the Django backend (no Kafka —
it was removed; see `backend/README.md` for why). `AI_SERVICE_URL` in `.env`
defaults to `http://host.docker.internal:3000`, matching step 1.

## 3. Add camera videos and register them

Drop video files under `Platform/backend/media/videos/` on the host (bind-mounted
into the containers), then register each one in the Django admin:

```
docker compose exec backend python manage.py createsuperuser
```

Visit `http://localhost:8000/admin/`, log in, and add a `Camera` per video
with `file_path` set to `/app/media/videos/yourfile.mp4` (the in-container path).

**Disk usage — read this before preprocessing:** preprocessing extracts
*every frame* of the video (no sampling) plus a detection+embedding per
person per frame. For a 60fps video that's roughly 1GB of frames+detections
per 2 minutes of footage. Trim your source videos to something reasonable
first:

```
docker compose exec backend sh -c "cd /app/media/videos && ffmpeg -y -i cam1.mp4 -t 120 -c copy cam1_trimmed.mp4 && mv cam1_trimmed.mp4 cam1.mp4"
```

(`-t 120` keeps the first 120 seconds; `-c copy` is instant, no re-encoding.)

## 4. Preprocess each camera

```
docker compose exec backend python manage.py preprocess_camera <camera_id>
```

This calls the AI service once per frame and caches frames + detections +
embeddings to `media/processed/cam<id>/`. Takes a while for longer clips —
progress prints as it goes. A camera can't be used in a session until this
has completed.

You can also trigger this over the API instead of a shell (handy from the
frontend or a script):

```
curl -X POST http://localhost:8000/api/cameras/<camera_id>/preprocess/
curl http://localhost:8000/api/cameras/<camera_id>/preprocess-status/
```

## 5. Start the frontend

```
cd Platform/frontend
npm install
npm run dev
```

Open `http://localhost:5173/`.

## 6. Test it

- **Start a session**: pick one or more preprocessed cameras, start monitoring.
  It should begin streaming essentially instantly (no warm-up delay) and
  play smoothly on a loop.
- **Click-to-track**: click a person in the feed — their box should turn
  blue (tracked). This works entirely off precomputed data; no AI service
  call happens (confirm with `docker logs -f` on the vision-pipeline
  container — you should only ever see `/health` checks while a session is
  running, never `/process`).
- **Untrack**: click the same tracked (blue) person again — their box should
  disappear and they stop being tracked.
- **Multiple cameras**: start a session with 2+ cameras. Each streams
  independently; starting a *new* session always clears everyone previously
  tracked, regardless of which session tracked them.
- **No tracking = no boxes**: with nobody tracked, you should see zero boxes
  drawn at all — boxes only ever appear for people currently matching a
  tracked embedding.

## Tuning knobs (`backend/.env`)

- `PREPROCESS_BATCH_SIZE` — how many frames per AI-service call during
  preprocessing (throughput, not quality).
- `PREPROCESS_FRAME_WIDTH` / `PREPROCESS_FRAME_HEIGHT` — resolution frames
  are stored/streamed at.
- `TRACKING_MATCH_THRESHOLD` — cosine similarity required to count as a
  match (0-1, higher = stricter, fewer false positives).
- `SESSION_MAX_CAMERAS` — cap on cameras per session.
