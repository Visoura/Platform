import { useEffect, useRef, useState } from 'react';
import { WS_BASE_URL } from '../lib/api';

export interface FeedBox {
  bbox: [number, number, number, number];
  confidence: number;
  matched: boolean;
  target_id?: string;
  score?: number;
}

export interface FrameMessage {
  camera_id: number;
  camera_name: string | null;
  frame_seq: number;
  timestamp: number;
  frame: string; // base64 jpeg, no data: prefix
  boxes: FeedBox[];
}

/** One websocket per session; the backend multiplexes every camera's frames
 * through it (frame.camera_id tells you which feed each message belongs to). */
export function useSessionFeed(sessionId: string | undefined) {
  const [framesByCamera, setFramesByCamera] = useState<Record<number, FrameMessage>>({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    setFramesByCamera({});
    const ws = new WebSocket(`${WS_BASE_URL}/ws/sessions/${sessionId}/`);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data: FrameMessage = JSON.parse(event.data);
        setFramesByCamera((prev) => ({ ...prev, [data.camera_id]: data }));
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      socketRef.current = null;
      ws.close();
    };
  }, [sessionId]);

  return { framesByCamera, connected };
}
