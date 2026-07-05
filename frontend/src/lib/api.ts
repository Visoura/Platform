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

export interface PreprocessStatus {
  status: 'not_started' | 'processing' | 'done' | 'failed';
  frames_done?: number;
  total_frames?: number;
  error?: string;
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

export type TrackingPreviewResponse =
  | { status: 'no_detection' }
  | { status: 'preview'; token: string; candidates: TrackingCandidate[] };

export interface Sighting {
  camera_id: number;
  camera_name: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
}

export interface SearchByImageTarget {
  target_id: string;
  bbox: [number, number, number, number];
  confidence: number;
}

export type SearchByImageResponse =
  | { status: 'found'; targets: SearchByImageTarget[] }
  | { status: 'no_person_detected'; targets: [] };

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
  preprocessCamera: (id: number) =>
    request<{ status: string }>(`/api/cameras/${id}/preprocess/`, { method: 'POST' }),
  preprocessStatus: (id: number) =>
    request<PreprocessStatus>(`/api/cameras/${id}/preprocess-status/`),
  listSessions: () => request<ApiSession[]>('/api/sessions/'),
  createSession: (cameraIds: number[]) =>
    request<ApiSession>('/api/sessions/', {
      method: 'POST',
      body: JSON.stringify({ cameras: cameraIds }),
    }),
  terminateSession: (id: string) =>
    request<{ status: string }>(`/api/sessions/${id}/terminate/`, { method: 'POST' }),
  previewTracking: (body: { camera_id: number; frame_seq: number; x: number; y: number }) =>
    request<TrackingPreviewResponse>('/api/tracking/preview/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  confirmTracking: (body: { token: string; index: number }) =>
    request<{ status: string; target_id?: string }>('/api/tracking/confirm/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  clearTracking: () => request<{ status: string }>('/api/tracking/clear/', { method: 'DELETE' }),
  untrackTarget: (body: { target_id: string }) =>
    request<{ status: string }>('/api/tracking/untrack/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  trackingStatus: () =>
    request<{ tracking_enabled: boolean; count: number }>('/api/tracking/status/'),
  getTrackHistory: (targetId: string) =>
    request<Sighting[]>(`/api/tracking/${targetId}/history/`),
  // Not using the shared request() helper - it forces Content-Type:
  // application/json, which would break the multipart boundary.
  searchByImage: async (file: File): Promise<SearchByImageResponse> => {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE_URL}/api/tracking/search-by-image/`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return res.json();
  },
};
