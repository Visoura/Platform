# Platform

AI Surveillance monitoring platform: React frontend + Django backend.

- [`frontend/`](frontend/) — React dashboard (Vite), implemented from the Figma design at
  https://www.figma.com/design/Fd00WBBxRzwJEcLfCPhWT8/AI-Surveillance-Dashboard-Design.
- [`backend/`](backend/) — Django REST API, Kafka pipeline and Channels websocket that
  streams camera frames + detections to the frontend. See [backend/README.md](backend/README.md).

## Running the frontend

```
cd frontend
npm install
npm run dev
```

## Running the backend

```
cd backend
cp .env.example .env
docker compose up --build
```
