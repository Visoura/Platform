import { DETECT_H, DETECT_W, REID_H, REID_W } from './config';
import type { Rect } from './types';

export const DETECT_SIZE = 3 * DETECT_W * DETECT_H;
export const REID_SIZE = 3 * REID_W * REID_H;

const letterboxCtx = new OffscreenCanvas(DETECT_W, DETECT_H).getContext('2d', { willReadFrequently: true })!;
const cropCtx = new OffscreenCanvas(REID_W, REID_H).getContext('2d', { willReadFrequently: true })!;
cropCtx.imageSmoothingQuality = 'medium';

export interface Letterbox {
  scale: number;
  x: number;
  y: number;
}

function planar(rgba: Uint8ClampedArray, out: Float32Array, offset: number, scale: number, shift: number) {
  const area = rgba.length / 4;
  for (let i = 0; i < area; i++) {
    out[offset + i] = rgba[4 * i] * scale + shift;
    out[offset + area + i] = rgba[4 * i + 1] * scale + shift;
    out[offset + 2 * area + i] = rgba[4 * i + 2] * scale + shift;
  }
}

export function letterbox(image: ImageBitmap, out: Float32Array, offset: number): Letterbox {
  const scale = Math.min(DETECT_W / image.width, DETECT_H / image.height);
  const w = Math.round(image.width * scale);
  const h = Math.round(image.height * scale);
  const x = Math.floor((DETECT_W - w) / 2);
  const y = Math.floor((DETECT_H - h) / 2);
  letterboxCtx.fillStyle = '#727272';
  letterboxCtx.fillRect(0, 0, DETECT_W, DETECT_H);
  letterboxCtx.drawImage(image, x, y, w, h);
  planar(letterboxCtx.getImageData(0, 0, DETECT_W, DETECT_H).data, out, offset, 1 / 255, 0);
  return { scale, x, y };
}

export function crop(image: ImageBitmap, [x1, y1, x2, y2]: Rect, out: Float32Array, offset: number) {
  cropCtx.drawImage(image, x1, y1, Math.max(x2 - x1, 1), Math.max(y2 - y1, 1), 0, 0, REID_W, REID_H);
  planar(cropCtx.getImageData(0, 0, REID_W, REID_H).data, out, offset, 1 / 127.5, -1);
}

export function thumbnail(image: ImageBitmap, [x1, y1, x2, y2]: Rect, height = 128) {
  const w = Math.max(x2 - x1, 1);
  const h = Math.max(y2 - y1, 1);
  const canvas = new OffscreenCanvas(Math.max(1, Math.round((w * height) / h)), height);
  canvas.getContext('2d')!.drawImage(image, x1, y1, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}
