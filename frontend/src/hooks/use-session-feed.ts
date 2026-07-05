import { useEffect, useRef, useState, type RefObject } from 'react';
import { WS_BASE_URL } from '../lib/api';

export interface FeedBox {
  bbox: [number, number, number, number];
  confidence: number;
  matched: boolean;
  target_id?: string;
  score?: number;
  /** 'image_search' if this target was tracked via a photo upload rather
   * than a click; used to fire a first-sighting notification. */
  source?: string | null;
}

export interface FrameMessage {
  camera_id: number;
  camera_name: string | null;
  frame_seq: number;
  timestamp: number;
  frame: string; // base64 jpeg, no data: prefix
  boxes: FeedBox[];
}

type Listener = () => void;

export interface FeedStore {
  getFrame: (cameraId: number) => FrameMessage | undefined;
  subscribe: (cameraId: number, listener: Listener) => () => void;
}

const emptyStore: FeedStore = {
  getFrame: () => undefined,
  subscribe: () => () => {},
};

/** One websocket per session; the backend multiplexes every camera's frames
 * through it (frame.camera_id tells you which feed each message belongs to).
 *
 * Frames are kept out of React state entirely - each camera arrives at its
 * own ~independent rate, and funnelling all of them through one state object
 * would re-render every camera's view on every other camera's frame (up to
 * 4x the necessary re-renders with 4 cameras streaming at once). Instead
 * this hands back a small store that individual CameraFeed instances read
 * via useCameraFrame/useSyncExternalStore, so a frame for camera A only
 * ever re-renders camera A's view. */
export function useSessionFeed(sessionId: string | undefined) {
  const [connected, setConnected] = useState(false);
  const storeRef = useRef<FeedStore>(emptyStore);

  useEffect(() => {
    if (!sessionId) return;

    const frames = new Map<number, FrameMessage>();
    const listeners = new Map<number, Set<Listener>>();

    storeRef.current = {
      getFrame: (cameraId) => frames.get(cameraId),
      subscribe: (cameraId, listener) => {
        if (!listeners.has(cameraId)) listeners.set(cameraId, new Set());
        listeners.get(cameraId)!.add(listener);
        return () => listeners.get(cameraId)?.delete(listener);
      },
    };

    const ws = new WebSocket(`${WS_BASE_URL}/ws/sessions/${sessionId}/`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data: FrameMessage = JSON.parse(event.data);
        frames.set(data.camera_id, data);
        listeners.get(data.camera_id)?.forEach((listener) => listener());
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.close();
      storeRef.current = emptyStore;
    };
  }, [sessionId]);

  return { store: storeRef, connected };
}

/** Reads a single camera's latest frame from the shared session feed store,
 * independent of every other camera's update rate.
 *
 * Frames can arrive much faster than the browser can decode+paint an <img>
 * update (e.g. ~40/sec at full native fps) - re-rendering on every single
 * message queues up more decode/paint work per second than the browser can
 * keep up with, which shows up as visible stutter even though the
 * underlying data arrives perfectly evenly. Polling the store once per
 * animation frame instead caps rendering to what the browser can actually
 * paint smoothly, always showing the freshest available frame rather than
 * trying to render every single one that arrived. */
export function useCameraFrame(store: RefObject<FeedStore>, cameraId: number) {
  const [frame, setFrame] = useState<FrameMessage | undefined>(() =>
    (store.current ?? emptyStore).getFrame(cameraId)
  );
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const latest = (store.current ?? emptyStore).getFrame(cameraId);
      if (latest && latest !== frameRef.current) {
        setFrame(latest);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [store, cameraId]);

  return frame;
}
