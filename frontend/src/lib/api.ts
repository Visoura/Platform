export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ?? API_BASE_URL.replace(/^http/, 'ws');

export interface ApiCamera {
  id: number;
  name: string;
  file_path: string;
  is_active: boolean;
  created_at: string;
}

export interface ApiSession {
  id: string;
  cameras_detail: ApiCamera[];
  status: 'active' | 'terminated';
  created_at: string;
  ended_at: string | null;
}

export interface TrackingCandidate {
  index: number;
  bbox: [number, number, number, number];
  confidence: number;
}

export type TrackingStartResponse =
  | { status: 'tracked'; target_id: string }
  | { status: 'no_detection' }
  | { status: 'ambiguous'; token: string; candidates: TrackingCandidate[] };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listCameras: () => request<ApiCamera[]>('/api/cameras/'),
  listSessions: () => request<ApiSession[]>('/api/sessions/'),
  createSession: (cameraIds: number[]) =>
    request<ApiSession>('/api/sessions/', {
      method: 'POST',
      body: JSON.stringify({ cameras: cameraIds }),
    }),
  terminateSession: (id: string) =>
    request<{ status: string }>(`/api/sessions/${id}/terminate/`, { method: 'POST' }),
  startTracking: (body: { camera_id: number; frame: string; x: number; y: number }) =>
    request<TrackingStartResponse>('/api/tracking/start/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  confirmTracking: (body: { token: string; index: number }) =>
    request<{ status: string; target_id?: string }>('/api/tracking/confirm/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  clearTracking: () => request<{ status: string }>('/api/tracking/clear/', { method: 'DELETE' }),
  trackingStatus: () =>
    request<{ tracking_enabled: boolean; count: number }>('/api/tracking/status/'),
};
