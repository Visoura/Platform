import { WS_URL } from './api';

export interface Box {
  box: [number, number, number, number];
  conf: number;
  track: number | null;
  target: string | null;
  name: string | null;
  score: number;
}

export interface FrameMeta {
  type: 'frame';
  camera: string;
  index: number;
  ts: number;
  boxes: Box[];
  frame?: string;
}

export interface Alert {
  type: 'alert';
  camera: string;
  target: string;
  name: string;
  ts: number;
}

export interface CameraFrame {
  meta: FrameMeta;
  image: ImageBitmap | null;
}

type Listener = () => void;

class Feed {
  frames = new Map<string, CameraFrame>();
  alertListeners = new Set<(a: Alert) => void>();
  connected = false;
  offset = 0;
  private bestRtt = Infinity;
  private latencies: number[] = [];
  private received = new Map<string, number>();
  private bytes = 0;
  private rates = { bytesPerSec: 0, fps: {} as Record<string, number> };
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private timers = false;

  connect() {
    if (this.ws) return;
    if (!this.timers) {
      this.timers = true;
      setInterval(() => this.ping(), 2000);
      setInterval(() => this.rollRates(), 1000);
    }
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.ping();
    };
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      setTimeout(() => this.connect(), 1000);
    };
    ws.onmessage = (e) => this.onMessage(e.data);
  }

  private ping() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
  }

  private onMessage(data: string | ArrayBuffer) {
    if (typeof data !== 'string') {
      this.bytes += data.byteLength;
      const headerLength = new DataView(data).getUint32(0, true);
      const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 4, headerLength)));
      this.onFrame(meta, new Blob([new Uint8Array(data, 4 + headerLength)], { type: 'image/jpeg' }));
      return;
    }
    this.bytes += data.length;
    const msg = JSON.parse(data);
    if (msg.type === 'pong') {
      const now = Date.now();
      const rtt = now - msg.client;
      if (rtt <= this.bestRtt * 1.5) {
        this.bestRtt = Math.min(rtt, this.bestRtt);
        this.offset = msg.server - (msg.client + now) / 2;
      }
    } else if (msg.type === 'alert') {
      this.alertListeners.forEach((l) => l(msg));
    } else if (msg.type === 'frame') {
      this.onFrame(msg, msg.frame ? base64ToBlob(msg.frame) : null);
    }
  }

  private async onFrame(meta: FrameMeta, blob: Blob | null) {
    const image = blob ? await createImageBitmap(blob) : null;
    const previous = this.frames.get(meta.camera);
    if (previous && previous.meta.index > meta.index && meta.index > 0) {
      image?.close();
      return;
    }
    previous?.image?.close();
    delete meta.frame;
    this.frames.set(meta.camera, { meta, image });
    this.received.set(meta.camera, (this.received.get(meta.camera) ?? 0) + 1);
    this.latencies.push(Date.now() + this.offset - meta.ts);
    if (this.latencies.length > 200) this.latencies.shift();
  }

  private rollRates() {
    this.rates = { bytesPerSec: this.bytes, fps: Object.fromEntries(this.received) };
    this.bytes = 0;
    this.received.clear();
    this.listeners.forEach((l) => l());
  }

  stats() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const fpsValues = Object.values(this.rates.fps);
    return {
      connected: this.connected,
      bytesPerSec: this.rates.bytesPerSec,
      fps: this.rates.fps,
      avgFps: fpsValues.length ? fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length : 0,
      latencyP50: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    };
  }

  onStats(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onAlert(listener: (a: Alert) => void) {
    this.alertListeners.add(listener);
    return () => {
      this.alertListeners.delete(listener);
    };
  }
}

function base64ToBlob(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

export const feed = new Feed();
