export type Rect = [number, number, number, number];

export interface Box {
  box: Rect;
  conf: number;
  track: number | null;
  target: string | null;
  name: string | null;
  score: number;
}

export interface FrameIn {
  camera: string;
  ts: number;
  image: ImageBitmap;
}

export interface CameraResult {
  camera: string;
  boxes: Box[];
}

export type Timings = Record<string, number>;

export interface Counts {
  detections: number;
  embeddings: number;
  matched: number;
  quality_skipped: number;
}

export interface ProcessResult {
  results: CameraResult[];
  timings: Timings;
  counts: Counts;
}

export interface TargetInfo<Thumb = Blob> {
  id: string;
  name: string;
  source: 'watchlist' | 'click';
  thumb: Thumb;
}

export interface CandidateInfo<Thumb = Blob> {
  index: number;
  thumb: Thumb;
  target: string | null;
  name: string | null;
}

export type ClickResult<Thumb = Blob> =
  | { status: 'ok'; token: string; candidates: CandidateInfo<Thumb>[] }
  | { status: 'no_detection' | 'no_frame' };

export interface BenchOut {
  elapsed: number;
  frames: number;
  timings: Timings;
  counts: Counts;
}
