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
}

export interface Alert {
  type: 'alert';
  camera: string;
  target: string;
  name: string;
  ts: number;
}

type Listener = () => void;

class Feed {
  frames = new Map<string, FrameMeta>();
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

  private onMessage(data: string) {
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
      this.onFrame(msg);
    }
  }

  private onFrame(meta: FrameMeta) {
    const previous = this.frames.get(meta.camera);
    if (previous && previous.index > meta.index && meta.index > 0) return;
    this.frames.set(meta.camera, meta);
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

export const feed = new Feed();
