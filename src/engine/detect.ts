import { DETECT_CONF, NMS_IOU } from './config';
import type { Letterbox } from './preprocess';
import type { Rect } from './types';

export interface Detection {
  box: Rect;
  score: number;
}

export function iou(a: Rect, b: Rect) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
}

function nms(dets: Detection[]) {
  dets.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of dets) {
    if (kept.every((k) => iou(k.box, d.box) < NMS_IOU)) kept.push(d);
  }
  return kept;
}

export function decode(out: Float32Array, image: number, anchors: number, lb: Letterbox, width: number, height: number) {
  const base = image * 5 * anchors;
  const dets: Detection[] = [];
  for (let i = 0; i < anchors; i++) {
    const score = out[base + 4 * anchors + i];
    if (score < DETECT_CONF) continue;
    const cx = out[base + i];
    const cy = out[base + anchors + i];
    const w = out[base + 2 * anchors + i];
    const h = out[base + 3 * anchors + i];
    const clip = (v: number, max: number) => Math.min(Math.max(v, 0), max);
    dets.push({
      box: [
        clip((cx - w / 2 - lb.x) / lb.scale, width),
        clip((cy - h / 2 - lb.y) / lb.scale, height),
        clip((cx + w / 2 - lb.x) / lb.scale, width),
        clip((cy + h / 2 - lb.y) / lb.scale, height),
      ],
      score,
    });
  }
  return nms(dets);
}
