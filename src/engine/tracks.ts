import { EMBED_EVERY_S, HYSTERESIS } from './config';
import type { Rect } from './types';

export interface TrackState {
  embedding: Float32Array | null;
  count: number;
  lastEmbedTs: number;
  target: string | null;
  score: number;
  lastSeenTs: number;
}

export class TrackMemory {
  private tracks = new Map<number, TrackState>();

  get(id: number) {
    let state = this.tracks.get(id);
    if (!state) {
      state = { embedding: null, count: 0, lastEmbedTs: -1e9, target: null, score: 0, lastSeenTs: 0 };
      this.tracks.set(id, state);
    }
    return state;
  }

  needsEmbedding(id: number, ts: number) {
    return ts - this.get(id).lastEmbedTs >= EMBED_EVERY_S;
  }

  addEmbedding(id: number, embedding: Float32Array, ts: number) {
    const state = this.get(id);
    const total = state.embedding ? state.embedding.map((v, k) => v * state.count + embedding[k]) : embedding;
    const norm = Math.hypot(...total);
    state.embedding = total.map((v) => v / norm);
    state.count++;
    state.lastEmbedTs = ts;
    return state.embedding;
  }

  assign(id: number, target: string | null, score: number, threshold: number) {
    const state = this.get(id);
    const required = target !== null && target === state.target ? threshold - HYSTERESIS : threshold;
    if (target !== null && score >= required) {
      state.target = target;
      state.score = score;
    } else {
      state.target = null;
      state.score = 0;
    }
  }

  forgetOlderThan(ts: number, maxAge = 10) {
    for (const [id, state] of this.tracks) if (ts - state.lastSeenTs >= maxAge) this.tracks.delete(id);
  }
}

export function goodCrop([x1, y1, x2, y2]: Rect, conf: number, width: number, height: number) {
  const margin = 2;
  const tallEnough = y2 - y1 >= 0.12 * height;
  const inside = x1 > margin && y1 > margin && x2 < width - margin && y2 < height - margin;
  const aspect = (y2 - y1) / Math.max(x2 - x1, 1);
  return tallEnough && inside && conf >= 0.55 && aspect >= 1.2 && aspect <= 5;
}
