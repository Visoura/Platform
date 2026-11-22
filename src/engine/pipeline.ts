import { ANALYSIS_FPS, MATCH_THRESHOLD } from './config';
import { decode, type Detection } from './detect';
import type { Models } from './models';
import { crop, DETECT_SIZE, letterbox, REID_SIZE } from './preprocess';
import type { Targets } from './targets';
import { Tracker } from './tracker';
import { goodCrop, TrackMemory } from './tracks';
import type { Counts, FrameIn, ProcessResult, Rect, Timings } from './types';

export interface Det extends Detection {
  track: number;
  embedding: Float32Array | null;
  target: string | null;
  name: string | null;
  match: number;
}

function oneMatchPerTarget(dets: Det[]) {
  const best = new Map<string, Det>();
  for (const d of dets) if (d.target && (!best.has(d.target) || d.match > best.get(d.target)!.match)) best.set(d.target, d);
  for (const d of dets) {
    if (d.target && best.get(d.target) !== d) [d.target, d.name, d.match] = [null, null, 0];
  }
}

export async function embedCrops(models: Models, crops: [ImageBitmap, Rect][], timings: Timings = {}) {
  const start = performance.now();
  const input = new Float32Array(crops.length * REID_SIZE);
  crops.forEach(([image, box], i) => crop(image, box, input, i * REID_SIZE));
  const middle = performance.now();
  const embeddings = await models.embed(input, crops.length);
  timings.crop = (timings.crop ?? 0) + middle - start;
  timings.reid = (timings.reid ?? 0) + performance.now() - middle;
  return embeddings;
}

export async function detectImages(models: Models, images: ImageBitmap[]) {
  const input = new Float32Array(images.length * DETECT_SIZE);
  const boxes = images.map((image, i) => letterbox(image, input, i * DETECT_SIZE));
  const { data, anchors } = await models.detect(input, images.length);
  return images.map((image, i) => decode(data, i, anchors, boxes[i], image.width, image.height));
}

export class Pipeline {
  private trackers = new Map<string, Tracker>();
  private memory = new Map<string, TrackMemory>();
  readonly last = new Map<string, { image: ImageBitmap; dets: Det[] }>();

  constructor(private models: Models, private targets: Targets) {}

  async process(frames: FrameIn[]): Promise<ProcessResult> {
    const timings: Timings = {};
    const counts: Counts = { detections: 0, embeddings: 0, matched: 0, quality_skipped: 0 };
    const time = async <T>(stage: string, fn: () => Promise<T> | T) => {
      const start = performance.now();
      const result = await fn();
      timings[stage] = (timings[stage] ?? 0) + performance.now() - start;
      return result;
    };
    const detections = await time('detect', () => detectImages(this.models, frames.map((f) => f.image)));
    counts.detections = detections.reduce((n, d) => n + d.length, 0);
    const dets = await time('track', () => frames.map((f, i) => this.track(f, detections[i])));
    await time('embed', () => this.embed(frames, dets, timings, counts));
    await time('match', () => this.match(frames, dets, counts));
    frames.forEach((f, i) => {
      this.last.get(f.camera)?.image.close();
      this.last.set(f.camera, { image: f.image, dets: dets[i] });
    });
    const results = frames.map((f, i) => ({
      camera: f.camera,
      boxes: dets[i].map((d) => ({
        box: [d.box[0] / f.image.width, d.box[1] / f.image.height, d.box[2] / f.image.width, d.box[3] / f.image.height] as Rect,
        conf: d.score,
        track: d.track,
        target: d.target,
        name: d.name,
        score: d.match,
      })),
    }));
    return { results, timings, counts };
  }

  private memoryFor(camera: string) {
    if (!this.memory.has(camera)) this.memory.set(camera, new TrackMemory());
    return this.memory.get(camera)!;
  }

  private track(frame: FrameIn, detections: Detection[]): Det[] {
    if (!this.trackers.has(frame.camera)) this.trackers.set(frame.camera, new Tracker(ANALYSIS_FPS));
    const ids = this.trackers.get(frame.camera)!.update(detections);
    const memory = this.memoryFor(frame.camera);
    const dets = detections
      .filter((d) => ids.has(d))
      .map((d) => ({ ...d, track: ids.get(d)!, embedding: null, target: null, name: null, match: 0 }));
    for (const d of dets) memory.get(d.track).lastSeenTs = frame.ts;
    memory.forgetOlderThan(frame.ts);
    return dets;
  }

  private async embed(frames: FrameIn[], dets: Det[][], timings: Timings, counts: Counts) {
    const chosen: [FrameIn, Det][] = [];
    frames.forEach((f, i) => {
      for (const d of dets[i]) {
        if (!goodCrop(d.box, d.score, f.image.width, f.image.height)) counts.quality_skipped++;
        else if (this.memoryFor(f.camera).needsEmbedding(d.track, f.ts)) chosen.push([f, d]);
      }
    });
    if (!chosen.length) return;
    const embeddings = await embedCrops(this.models, chosen.map(([f, d]) => [f.image, d.box]), timings);
    chosen.forEach(([f, d], k) => (d.embedding = this.memoryFor(f.camera).addEmbedding(d.track, embeddings[k], f.ts)));
    counts.embeddings += chosen.length;
  }

  private match(frames: FrameIn[], dets: Det[][], counts: Counts) {
    const fresh = frames.flatMap((f, i) => dets[i].filter((d) => d.embedding).map((d) => [f, d] as const));
    if (fresh.length && this.targets.size) {
      const results = this.targets.match(fresh.map(([, d]) => d.embedding!));
      fresh.forEach(([f, d], k) => this.memoryFor(f.camera).assign(d.track, results[k].target, results[k].score, MATCH_THRESHOLD));
    }
    frames.forEach((f, i) => {
      for (const d of dets[i]) {
        const state = this.memoryFor(f.camera).get(d.track);
        const target = state.target ? this.targets.get(state.target) : undefined;
        if (target) [d.target, d.name, d.match] = [target.id, target.name, state.score];
      }
      oneMatchPerTarget(dets[i]);
      counts.matched += dets[i].filter((d) => d.target).length;
    });
  }

  trackEmbedding(camera: string, det: Det) {
    return this.memoryFor(camera).get(det.track).embedding ?? det.embedding;
  }

  close() {
    for (const { image } of this.last.values()) image.close();
    this.last.clear();
  }
}
