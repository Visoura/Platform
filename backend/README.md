# Platform backend

Django REST API + Django Channels websocket that replays precomputed
per-camera person detections/embeddings to the frontend at a paced,
realistic rate.

## Architecture

```
Camera video files (fixed, registered in /admin)
        │
        ▼  POST /api/cameras/{id}/preprocess/  (or: manage.py preprocess_camera <id>)
 preprocessing  ──HTTP──▶  AI_SERVICE_URL /process  (external vision-pipeline)
        │  JPEG frames + bboxes + embeddings, written once to disk
        ▼
 media/processed/cam{id}/{frames/*.jpg, detections.jsonl, meta.json}
        │
        ▼  POST /api/sessions/ starts a background "playback" thread per camera
 playback thread (in-process, inside the `backend` container)
        │  reads precomputed frame + detections, paced at meta.json's fps
        │  checks tracked_people Qdrant collection (global tracking mode)
        │    - empty:      forward every detected box
        │    - non-empty:  keep only boxes matching a tracked embedding
        ▼
 Channels layer (Redis) group `session_<id>`
        │
        ▼
 websocket  ws://.../ws/sessions/<id>/   ◀── frontend
```

The AI service is only ever called during preprocessing - live sessions and
click-to-track both work entirely off the precomputed data on disk, so there
is no GPU/compute bottleneck while anyone is actually watching, regardless of
how many cameras are streaming at once ("fake realtime": frames are replayed
at a realistic pace rather than generated live).

Tracking mode is **global**: it's on whenever the `tracked_people` Qdrant
collection has any points in it, shared across every active session.

## Endpoints

- `GET  /api/cameras/` — list cameras registered in the admin.
- `POST /api/cameras/{id}/preprocess/` — starts detection+embedding extraction for this
  camera's video in a background thread. Required before a session can use this camera.
  Returns `{status: "started"}` / `{status: "already_running"}`.
- `GET  /api/cameras/{id}/preprocess-status/` — `{status: "not_started"|"processing"|"done"|"failed", frames_done, total_frames}`.
- `GET  /api/sessions/` — list every session started before (active + terminated).
- `POST /api/sessions/` — `{cameras: [id, ...]}` (max `SESSION_MAX_CAMERAS`, all must already
  be preprocessed). Creates the session and starts its playback threads; the response returns
  immediately, no artificial warm-up delay.
- `POST /api/sessions/{id}/terminate/` — stops its playback threads.
- `WS   /ws/sessions/{id}/` — live `{camera_id, frame, frame_seq, boxes: [{bbox, confidence, matched, ...}]}` feed.
- `POST /api/tracking/start/` — `{camera_id, frame_seq, x, y}` (x/y as 0..1 fractions of the
  frame). Looks up that exact frame's precomputed detections (no AI service call) and adds the
  clicked person to the global tracked set. Returns `{status: "tracked"}`, `{status: "no_detection"}`,
  or — if the click overlaps more than one detection — `{status: "ambiguous", token, candidates: [...]}`.
- `POST /api/tracking/confirm/` — `{token, index}` — resolves an ambiguous `/start/`.
- `POST /api/tracking/untrack/` — `{target_id}` — stops tracking one specific person.
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

Before starting a session, preprocess each camera you plan to use:

```
docker compose exec backend python manage.py preprocess_camera 1
```

This calls the AI service once and caches `PREPROCESS_DURATION_SECONDS` worth of the
video (sampled at `PREPROCESS_FPS`) to `media/processed/cam1/` — that's what sessions
loop and replay. The AI vision-pipeline service (detector + embedder) is external — set
`AI_SERVICE_URL` in `.env` to wherever it's running; it's only needed for this step.
