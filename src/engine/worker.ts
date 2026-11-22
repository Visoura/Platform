import { Models } from './models';
import { detectImages, embedCrops, Pipeline } from './pipeline';
import { thumbnail } from './preprocess';
import { Targets, type Target } from './targets';
import type { BenchOut, ClickResult, Counts, FrameIn, Rect, Timings } from './types';

const models = new Models();
const targets = new Targets();
const selections = new Map<string, { embedding: Float32Array; thumb: Blob; target: string | null }[]>();
let pipeline = new Pipeline(models, targets);

const info = ({ embedding: _, ...rest }: Target) => rest;

async function click({ camera, x, y }: { camera: string; x: number; y: number }): Promise<ClickResult> {
  const last = pipeline.last.get(camera);
  if (!last) return { status: 'no_frame' };
  const { image, dets } = last;
  const [px, py] = [x * image.width, y * image.height];
  const area = (b: Rect) => (b[2] - b[0]) * (b[3] - b[1]);
  const hits = dets.filter((d) => d.box[0] <= px && px <= d.box[2] && d.box[1] <= py && py <= d.box[3]).sort((a, b) => area(a.box) - area(b.box));
  if (!hits.length) return { status: 'no_detection' };
  const embeddings = hits.map((d) => pipeline.trackEmbedding(camera, d));
  const missing = hits.filter((_, i) => !embeddings[i]);
  if (missing.length) {
    const fresh = await embedCrops(models, missing.map((d) => [image, d.box]));
    missing.forEach((d) => (embeddings[hits.indexOf(d)] = fresh.shift()!));
  }
  const thumbs = await Promise.all(hits.map((d) => thumbnail(image, d.box)));
  const token = crypto.randomUUID();
  selections.set(token, hits.map((d, i) => ({ embedding: embeddings[i]!, thumb: thumbs[i], target: d.target })));
  return { status: 'ok', token, candidates: hits.map((d, i) => ({ index: i, thumb: thumbs[i], target: d.target, name: d.name })) };
}

function track({ token, index, name }: { token: string; index: number; name?: string }) {
  const choice = selections.get(token)?.[index];
  selections.delete(token);
  if (!choice) throw new Error('selection expired, click again');
  const existing = choice.target ? targets.get(choice.target) : undefined;
  if (existing) return info(existing);
  const target = { id: crypto.randomUUID().slice(0, 8), name: name ?? `person-${targets.count('click') + 1}`, source: 'click' as const, ...choice };
  return info(targets.add(target));
}

async function addPhoto({ name, image }: { name: string; image: ImageBitmap }) {
  const [dets] = await detectImages(models, [image]);
  const area = (b: Rect) => (b[2] - b[0]) * (b[3] - b[1]);
  const largest = dets.sort((a, b) => area(b.box) - area(a.box))[0];
  const whole: Rect = [0, 0, image.width, image.height];
  const box = largest && area(largest.box) < 0.5 * area(whole) ? largest.box : whole;
  const [embedding] = await embedCrops(models, [[image, box]]);
  const thumb = await thumbnail(image, box);
  image.close();
  return info(targets.add({ id: `w-${name}`, name, source: 'watchlist', embedding, thumb }));
}

async function bench({ batches }: { batches: FrameIn[][] }): Promise<BenchOut> {
  const run = new Pipeline(models, targets);
  const warmup = Math.min(3, batches.length - 1);
  for (const frames of batches.slice(0, warmup)) await run.process(frames);
  const timings: Timings = {};
  const counts: Counts = { detections: 0, embeddings: 0, matched: 0, quality_skipped: 0 };
  let frames = 0;
  const start = performance.now();
  for (const batch of batches.slice(warmup)) {
    const out = await run.process(batch);
    for (const [k, v] of Object.entries(out.timings)) timings[k] = (timings[k] ?? 0) + v;
    for (const k of Object.keys(counts) as (keyof Counts)[]) counts[k] += out.counts[k];
    frames += batch.length;
  }
  const elapsed = performance.now() - start;
  run.close();
  return { elapsed, frames, timings, counts };
}

const handlers: Record<string, (payload: never) => unknown> = {
  init: ({ base }: { base: string }) => models.load(base, (file, loaded, total) => postMessage({ type: 'progress', file, loaded, total })),
  process: ({ frames }: { frames: FrameIn[] }) => pipeline.process(frames),
  reset: () => {
    pipeline.close();
    pipeline = new Pipeline(models, targets);
  },
  click,
  track,
  addPhoto,
  removeTarget: ({ id }: { id: string }) => targets.remove(id),
  bench,
};

let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<{ id: number; type: string; payload: never }>) => {
  const { id, type, payload } = e.data;
  queue = queue
    .then(() => handlers[type](payload))
    .then(
      (result) => postMessage({ id, result }),
      (error) => postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
    );
};
