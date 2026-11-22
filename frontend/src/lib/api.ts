export const API_URL = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:8000`;
export const WEBRTC_URL = import.meta.env.VITE_WEBRTC_URL ?? `http://${location.hostname}:8889`;
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export interface Camera {
  id: string;
  fps: number;
  width: number;
  height: number;
  webrtc_path: string;
}

export interface EngineState {
  status: 'starting' | 'running' | 'stopped' | 'error' | 'benchmarking';
  error: string | null;
  cameras: Camera[];
  config: { device: string; gpu: string; detector: string; analysis_fps: number; match_threshold: number };
  bench_running: boolean;
}

export interface Summary {
  p50: number;
  p95: number;
  mean: number;
  n: number;
}

export interface Metrics {
  uptime: number;
  stages: Record<string, Summary>;
  totals: Record<string, number>;
  rates: Record<string, number>;
  latency: Summary;
  system: { cpu_percent?: number; rss_mb?: number; cores?: number; gpu_util?: number | null; gpu_mem_mb?: number | null };
  ws_bytes_sent: number;
  ws_dropped: number;
  ws_clients: number;
}

export interface Target {
  id: string;
  name: string;
  source: 'watchlist' | 'click';
  thumb: string;
}

export interface Candidate {
  index: number;
  box: [number, number, number, number];
  thumb: string;
  target: string | null;
  name: string | null;
}

export type ClickResult =
  | { status: 'ok'; token: string; candidates: Candidate[] }
  | { status: 'no_detection' | 'no_frame' };

export interface Sighting {
  camera: string;
  started_at: number;
  ended_at: number | null;
}

export interface BenchReport {
  id: string;
  frames_per_camera: number;
  cameras: string[];
  device: string;
  gpu: string;
  detector: string;
  analysis_fps: number;
  elapsed: number;
  throughput_fps: number;
  analyzed_fps: number;
  realtime_cameras: number;
  stage_ms_per_frame: Record<string, number>;
  cpu_percent: number;
  rss_mb: number;
  detections_per_frame: number;
  embeddings_per_frame: number;
  matches_per_frame: number;
}

export interface BenchState {
  running: boolean;
  error: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API_URL + path, init);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  state: () => request<EngineState>('/api/state'),
  metrics: () => request<Metrics>('/api/metrics'),
  click: (camera: string, index: number, x: number, y: number) =>
    request<ClickResult>('/api/click', json('POST', { camera, index, x, y })),
  track: (token: string, index: number, name?: string) =>
    request<Target>('/api/targets', json('POST', { token, index, name })),
  targets: () => request<Target[]>('/api/targets'),
  untrack: (id: string) => request<unknown>(`/api/targets/${id}`, { method: 'DELETE' }),
  history: (id: string) => request<Sighting[]>(`/api/targets/${id}/history`),
  uploadPhoto: (file: File, name: string) => {
    const form = new FormData();
    form.append('image', file);
    form.append('name', name);
    return request<Target>('/api/targets/photo', { method: 'POST', body: form });
  },
  startBench: (frames: number) => request<BenchState>('/api/bench', json('POST', { frames })),
  bench: () => request<BenchState>('/api/bench'),
  reports: () => request<BenchReport[]>('/api/bench/reports'),
};
