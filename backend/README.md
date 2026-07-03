# Platform backend

Django REST API + Kafka pipeline + Django Channels websocket that streams
camera frames and person detections/embeddings to the frontend.

## Architecture

```
Camera video files (fixed, registered in /admin)
        │
        ▼  (POST /api/sessions/ starts a background thread per camera)
 frame producer (in-process, inside the `backend` container)
        │  JPEG frames, keyed by camera_id
        ▼
 Kafka topic: frames.raw
        │
        ▼  batched, fair per camera (see run_gpu_consumer.py)
 gpu-consumer  ──HTTP──▶  AI_SERVICE_URL /process  (external vision-pipeline)
        │  frame + bboxes + embeddings
        ▼
 Kafka topic: frames.processed
        │
        ▼
 ws-forwarder  ──▶  checks tracked_people Qdrant collection (global tracking mode)
        │              - empty:      forward every detected box
        │              - non-empty:  keep only boxes matching a tracked embedding
        ▼
 Channels layer (Redis) group `session_<id>`
        │
        ▼
 websocket  ws://.../ws/sessions/<id>/   ◀── frontend
```

Tracking mode is **global**: it's on whenever the `tracked_people` Qdrant
collection has any points in it, shared across every active session.

## Endpoints

- `GET  /api/cameras/` — list cameras registered in the admin.
- `GET  /api/sessions/` — list every session started before (active + terminated).
- `POST /api/sessions/` — `{cameras: [id, ...]}` (max `SESSION_MAX_CAMERAS`). Creates the
  session, starts its frame producers, waits `SESSION_START_DELAY_SECONDS` to let the
  pipeline buffer, then returns. Open the websocket only after this responds.
- `POST /api/sessions/{id}/terminate/` — stops its frame producers.
- `WS   /ws/sessions/{id}/` — live `{camera_id, frame, boxes: [{bbox, confidence, matched, ...}]}` feed.
- `POST /api/tracking/start/` — `{camera_id, frame: "<base64 jpg>", x, y}` (x/y as 0..1
  fractions of the frame). Adds the clicked person to the global tracked set.
  Returns `{status: "tracked"}`, `{status: "no_detection"}`, or — if the click overlaps
  more than one detection — `{status: "ambiguous", token, candidates: [...]}`.
- `POST /api/tracking/confirm/` — `{token, index}` — resolves an ambiguous `/start/`.
- `DELETE /api/tracking/clear/` — clears all tracked targets (turns tracking mode off).
- `GET  /api/tracking/status/` — `{tracking_enabled, count}`.

## Running

```
cp .env.example .env
docker compose up --build
```

Then register cameras in `/admin/` (create a superuser first):

```
docker compose exec backend python manage.py createsuperuser
```

Camera `file_path` must point at a video file visible **inside the containers** —
drop files under `./media/videos/` on the host and reference them as
`/app/media/videos/cam1.mp4` (that folder is bind-mounted into every service).

The AI vision-pipeline service (detector + embedder) is external — set
`AI_SERVICE_URL` in `.env` to wherever it's running.
