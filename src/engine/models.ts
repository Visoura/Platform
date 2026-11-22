import * as ort from 'onnxruntime-web/webgpu';
import { DETECT_H, DETECT_W, REID_DIM, REID_H, REID_W } from './config';

export type Progress = (file: string, loaded: number, total: number) => void;

async function download(url: string, onProgress: Progress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status}). Run tools/prepare_web.py first.`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(url.split('/').pop()!, loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function adapterName() {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: { vendor: string; architecture: string } } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter();
  if (!adapter) return 'no WebGPU adapter';
  return [adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(' ') || 'WebGPU adapter';
}

export class Models {
  detector!: ort.InferenceSession;
  reid!: ort.InferenceSession;
  backend = '';

  async load(base: string, onProgress: Progress) {
    ort.env.wasm.numThreads = 1;
    const detector = await download(`${base}models/detector.onnx`, onProgress);
    const reid = await download(`${base}models/reid.onnx`, onProgress);
    for (const backend of ['webgpu', 'wasm']) {
      try {
        const options = { executionProviders: [backend], graphOptimizationLevel: 'all' as const, logSeverityLevel: 3 as const };
        this.detector = await ort.InferenceSession.create(detector, options);
        this.reid = await ort.InferenceSession.create(reid, options);
        this.backend = backend === 'webgpu' ? 'WebGPU' : 'WASM (CPU)';
        break;
      } catch (e) {
        if (backend === 'wasm') throw e;
      }
    }
    return { backend: this.backend, adapter: this.backend === 'WebGPU' ? await adapterName() : 'CPU' };
  }

  async detect(input: Float32Array, n: number) {
    const tensor = new ort.Tensor('float32', input, [n, 3, DETECT_H, DETECT_W]);
    const out = (await this.detector.run({ [this.detector.inputNames[0]]: tensor }))[this.detector.outputNames[0]];
    return { data: out.data as Float32Array, anchors: out.dims[2] };
  }

  async embed(input: Float32Array, n: number) {
    const tensor = new ort.Tensor('float32', input, [n, 3, REID_H, REID_W]);
    const out = (await this.reid.run({ [this.reid.inputNames[0]]: tensor }))[this.reid.outputNames[0]];
    const data = out.data as Float32Array;
    return Array.from({ length: n }, (_, i) => data.slice(i * REID_DIM, (i + 1) * REID_DIM));
  }
}
