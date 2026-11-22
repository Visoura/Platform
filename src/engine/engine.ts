import { ANALYSIS_FPS, GRAB_WIDTH, MAX_IN_FLIGHT } from './config';
import { Metrics } from './metrics';
import { SightingLog } from './sightings';
import type { BenchOut, Box, CandidateInfo, ClickResult, FrameIn, ProcessResult, TargetInfo } from './types';

export type Target = TargetInfo<string>;
export type Candidate = CandidateInfo<string>;

export interface Camera {
  id: string;
  url: string;
  video: HTMLVideoElement;
}

export interface BenchRun {
  id: string;
  backend: string;
  adapter: string;
  cameras: number;
  frames: number;
  analyzed_fps: number;
  cameras_at_analysis_fps: number;
  stage_ms_per_frame: Record<string, number>;
  detections_per_frame: number;
  embeddings_per_frame: number;
  matches_per_frame: number;
}

export type Status = 'idle' | 'loading' | 'running' | 'benchmarking' | 'error';

const BASE = new URL(import.meta.env.BASE_URL, location.href).href;
const RUNS_KEY = 'visoura-bench-runs';
const VIDEO_TYPES = /\.(mp4|webm|mov|mkv)$/i;

function loadRuns(): BenchRun[] {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRuns(runs: BenchRun[]) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    // private mode or storage disabled: runs stay in memory
  }
}

async function manifest(folder: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}${folder}/manifest.json`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

function grab(video: HTMLVideoElement) {
  const width = Math.min(GRAB_WIDTH, video.videoWidth);
  const height = Math.round((video.videoHeight * width) / video.videoWidth);
  return createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' });
}

function once(target: EventTarget, event: string) {
  return new Promise((resolve) => target.addEventListener(event, resolve, { once: true }));
}

let parking: HTMLDivElement | null = null;

export function park(video: HTMLVideoElement) {
  if (!parking) {
    parking = document.createElement('div');
    parking.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:36px;opacity:0;pointer-events:none;overflow:hidden';
    document.body.append(parking);
  }
  parking.append(video);
}

function makeVideo(url: string) {
  const video = document.createElement('video');
  Object.assign(video, { src: url, muted: true, loop: true, playsInline: true, autoplay: true });
  video.className = 'absolute inset-0 h-full w-full object-contain';
  park(video);
  return video;
}

async function captureFrames(url: string, n: number) {
  const video = document.createElement('video');
  Object.assign(video, { src: url, muted: true, preload: 'auto' });
  await once(video, 'loadeddata');
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < n; i++) {
    video.currentTime = Math.min(i / ANALYSIS_FPS, video.duration - 0.05);
    await once(video, 'seeked');
    frames.push(await grab(video));
  }
  video.removeAttribute('src');
  video.load();
  return frames;
}

class Engine {
  status: Status = 'idle';
  message = '';
  backend = '';
  adapter = '';
  cameras: Camera[] = [];
  targets: Target[] = [];
  results = new Map<string, { boxes: Box[] }>();
  metrics = new Metrics();
  benchRuns = loadRuns();
  benchError = '';
  version = 0;
  private worker: Worker | null = null;
  private calls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextCall = 1;
  private inFlight = 0;
  private listeners = new Set<() => void>();
  private alertListeners = new Set<(name: string, camera: string) => void>();
  private sightings = new SightingLog((camera, target) => {
    const name = this.targets.find((t) => t.id === target)?.name ?? target;
    this.alertListeners.forEach((l) => l(name, camera));
  });

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  onAlert(listener: (name: string, camera: string) => void) {
    this.alertListeners.add(listener);
    return () => {
      this.alertListeners.delete(listener);
    };
  }

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private call<T>(type: string, payload: object = {}, transfer: Transferable[] = []) {
    const id = this.nextCall++;
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ id, type, payload }, transfer);
    });
  }

  private onMessage = (e: MessageEvent) => {
    const data = e.data;
    if (data.type === 'progress') {
      this.message = `Downloading ${data.file}: ${(data.loaded / 1e6).toFixed(1)}${data.total ? ` / ${(data.total / 1e6).toFixed(1)}` : ''} MB`;
      this.emit();
      return;
    }
    const call = this.calls.get(data.id);
    this.calls.delete(data.id);
    if (data.error) call?.reject(new Error(data.error));
    else call?.resolve(data.result);
  };

  async start() {
    if (this.worker) return;
    this.status = 'loading';
    this.emit();
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.onMessage;
    try {
      const videos = await manifest('videos');
      this.setCameras(videos.map((file) => ({ id: file.replace(/\.[^.]+$/, ''), url: `${BASE}videos/${file}` })));
      const loaded = await this.call<{ backend: string; adapter: string }>('init', { base: BASE });
      this.backend = loaded.backend;
      this.adapter = loaded.adapter;
      this.message = 'Embedding the watchlist';
      this.emit();
      for (const file of await manifest('persons')) {
        const blob = await (await fetch(`${BASE}persons/${file}`)).blob();
        await this.addPhoto(blob, file.replace(/\.[^.]+$/, ''));
      }
      this.status = 'running';
      this.message = '';
    } catch (e) {
      this.status = 'error';
      this.message = e instanceof Error ? e.message : String(e);
    }
    this.emit();
    setInterval(() => this.tick(), 1000 / ANALYSIS_FPS);
    setInterval(() => {
      this.metrics.tick();
      this.emit();
    }, 1000);
  }

  private setCameras(list: { id: string; url: string }[]) {
    for (const c of this.cameras) {
      c.video.remove();
      if (c.url.startsWith('blob:')) URL.revokeObjectURL(c.url);
    }
    this.cameras = list.map((c) => ({ ...c, video: makeVideo(c.url) }));
    this.results.clear();
    this.emit();
  }

  async openVideos(files: File[]) {
    const videos = files.filter((f) => VIDEO_TYPES.test(f.name) || f.type.startsWith('video/'));
    this.setCameras(videos.map((f) => ({ id: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) })));
    if (this.worker) await this.call('reset');
  }

  private async tick() {
    if (this.status !== 'running') return;
    const live = this.cameras.filter((c) => c.video.readyState >= 2 && !c.video.paused && c.video.videoWidth);
    if (!live.length) return;
    if (this.inFlight >= MAX_IN_FLIGHT) {
      this.metrics.count('frames_dropped', live.length);
      return;
    }
    this.inFlight++;
    const start = performance.now();
    try {
      const frames: FrameIn[] = await Promise.all(live.map(async (c) => ({ camera: c.id, ts: start / 1000, image: await grab(c.video) })));
      this.metrics.add('grab', performance.now() - start);
      const out = await this.call<ProcessResult>('process', { frames }, frames.map((f) => f.image));
      this.metrics.add('latency', performance.now() - start);
      for (const [stage, ms] of Object.entries(out.timings)) this.metrics.add(stage, ms);
      for (const [name, n] of Object.entries(out.counts)) this.metrics.count(name, n);
      this.metrics.count('frames_analyzed', frames.length);
      for (const r of out.results) {
        this.results.set(r.camera, r);
        const visible = new Map(r.boxes.filter((b) => b.target).map((b) => [b.target!, b.name!]));
        this.sightings.update(r.camera, visible, Date.now() / 1000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.inFlight--;
    }
  }

  async addPhoto(file: Blob, name: string) {
    const image = await createImageBitmap(file);
    const target = await this.call<TargetInfo>('addPhoto', { name: name.replace(/[^\w-]+/g, '_'), image }, [image]);
    return this.addTarget(target);
  }

  private addTarget(t: TargetInfo) {
    const target = { ...t, thumb: URL.createObjectURL(t.thumb) };
    this.targets = [...this.targets.filter((x) => x.id !== t.id), target];
    this.emit();
    return target;
  }

  async removeTarget(id: string) {
    await this.call('removeTarget', { id });
    this.targets = this.targets.filter((t) => t.id !== id);
    this.emit();
  }

  async click(camera: string, x: number, y: number): Promise<ClickResult<string>> {
    const result = await this.call<ClickResult>('click', { camera, x, y });
    if (result.status !== 'ok') return result;
    return { ...result, candidates: result.candidates.map((c) => ({ ...c, thumb: URL.createObjectURL(c.thumb) })) };
  }

  async track(token: string, index: number) {
    const t = await this.call<TargetInfo>('track', { token, index });
    return this.targets.find((x) => x.id === t.id) ?? this.addTarget(t);
  }

  history(target: string) {
    return this.sightings.history(target);
  }

  async benchmark(framesPerCamera: number) {
    if (this.status !== 'running' || !this.cameras.length) return;
    this.status = 'benchmarking';
    this.benchError = '';
    this.message = 'Capturing frames from each video';
    this.emit();
    this.cameras.forEach((c) => c.video.pause());
    while (this.inFlight) await new Promise((r) => setTimeout(r, 50));
    try {
      const perCamera = await Promise.all(this.cameras.map((c) => captureFrames(c.url, framesPerCamera)));
      const batches = Array.from({ length: framesPerCamera }, (_, i) =>
        this.cameras.map((c, k) => ({ camera: c.id, ts: i / ANALYSIS_FPS, image: perCamera[k][i] })),
      );
      this.message = 'Running the pipeline as fast as possible';
      this.emit();
      const out = await this.call<BenchOut>('bench', { batches }, batches.flat().map((f) => f.image));
      const seconds = out.elapsed / 1000;
      const analyzed = out.frames / seconds;
      const run: BenchRun = {
        id: new Date().toISOString().slice(0, 19).replace('T', ' '),
        backend: this.backend,
        adapter: this.adapter,
        cameras: this.cameras.length,
        frames: framesPerCamera,
        analyzed_fps: analyzed,
        cameras_at_analysis_fps: analyzed / ANALYSIS_FPS,
        stage_ms_per_frame: Object.fromEntries(Object.entries(out.timings).map(([k, v]) => [k, v / out.frames])),
        detections_per_frame: out.counts.detections / out.frames,
        embeddings_per_frame: out.counts.embeddings / out.frames,
        matches_per_frame: out.counts.matched / out.frames,
      };
      this.benchRuns = [run, ...this.benchRuns].slice(0, 20);
      saveRuns(this.benchRuns);
    } catch (e) {
      this.benchError = e instanceof Error ? e.message : String(e);
    }
    this.cameras.forEach((c) => c.video.play());
    this.status = 'running';
    this.message = '';
    this.emit();
  }
}

export const engine = new Engine();
