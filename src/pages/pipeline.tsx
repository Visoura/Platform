import { useEffect, useRef } from 'react';
import { Card, HorizontalBars, StatTile, TimeLines } from '../components/charts';
import { ANALYSIS_FPS } from '../engine/config';
import { useEngine } from '../lib/hooks';

const STAGES = ['grab', 'detect', 'track', 'embed', 'match'];
const SUBSTAGES = ['crop', 'reid'];

const DESIGN = [
  ['grab', 'engine/engine.ts', `Every ${1000 / ANALYSIS_FPS} ms the page copies the current frame of each <video> into an ImageBitmap at 640px wide (the "sub-stream") and transfers it to the worker without copying. At most two batches are in flight; if both slots are busy the tick is dropped, so the overlay never falls behind live.`],
  ['detect', 'engine/pipeline.ts, detect.ts', 'All cameras go through YOLO11n in one batched call, letterboxed to 640x384, in fp16 on WebGPU. The exported model only outputs the person class, and NMS runs in JavaScript on the few boxes above 0.4.'],
  ['track', 'engine/tracker.ts', 'A small ByteTrack-style tracker: boxes move with a smoothed velocity, confident detections are matched by overlap first, weak ones only extend existing tracks.'],
  ['embed', 'engine/pipeline.ts, preprocess.ts', 'Only new tracks, and each track again every 0.5 s, are cropped (canvas drawImage to 128x256) and embedded in one fp16 batch. Tiny or cut-off crops are skipped.'],
  ['match', 'engine/targets.ts, tracks.ts', 'A dot product against every watchlist embedding. A track keeps its identity with a 0.1 hysteresis margin, and each person is shown at most once per camera.'],
];

export function PipelinePage() {
  const engine = useEngine();
  const history = useRef<Record<string, number>[]>([]);
  const rates = engine.metrics.rates;

  useEffect(() => {
    history.current = [...history.current, { analyzed: rates.frames_analyzed ?? 0, dropped: rates.frames_dropped ?? 0 }].slice(-90);
  }, [rates]);

  const stage = (s: string) => engine.metrics.stage(s);
  const stageData = STAGES.map((s) => ({ name: s, value: stage(s)?.mean ?? 0 }));
  const timeline = history.current.map((p, i, all) => ({ t: i - all.length + 1, ...p }));
  const fmt = (v: number | undefined, d = 1) => (v ?? 0).toFixed(d);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(340px,420px)_1fr]">
      <Card title="How this pipeline works" subtitle="The page grabs frames and draws boxes. A Web Worker runs the models with ONNX Runtime Web, so the page never stutters.">
        <ol className="space-y-3">
          {DESIGN.map(([name, file, text]) => (
            <li key={name} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{name}</span>
                <code className="text-[11px] text-[var(--muted)]">src/{file}</code>
              </div>
              <p className="text-[var(--ink-2)]">{text}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile label="Analyzed fps (all cameras)" value={fmt(rates.frames_analyzed)} hint={`target ${ANALYSIS_FPS} per camera`} />
          <StatTile label="Frames dropped / s" value={fmt(rates.frames_dropped)} hint="ticks skipped because the models were busy" />
          <StatTile label="Latency p50" value={`${fmt(stage('latency')?.p50, 0)} ms`} hint={`p95 ${fmt(stage('latency')?.p95, 0)} ms, grab to boxes`} />
          <StatTile label="Runtime" value={engine.backend || '…'} hint={engine.adapter} />
          <StatTile label="People / s" value={fmt(rates.detections, 0)} />
          <StatTile label="Embeddings / s" value={fmt(rates.embeddings, 1)} hint={`quality skipped ${fmt(rates.quality_skipped, 0)}/s`} />
          <StatTile label="Matched / s" value={fmt(rates.matched, 1)} />
          <StatTile label="Cameras" value={String(engine.cameras.length)} />
        </div>

        <Card title="Throughput" subtitle="Frames per second over the last 90 s (all cameras)">
          <TimeLines
            data={timeline}
            series={[
              { key: 'analyzed', label: 'analyzed', color: 'var(--series-1)' },
              { key: 'dropped', label: 'dropped', color: 'var(--series-2)' },
            ]}
          />
        </Card>

        <Card title="Time per stage" subtitle="Mean milliseconds per batch (one frame from each camera)">
          <HorizontalBars data={stageData} unit="ms" />
        </Card>

        <Card title="Stage details" subtitle="p50 / p95 per batch over the last 100 batches, including the two parts of embed">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="text-left font-normal">stage</th>
                <th className="text-right font-normal">p50 ms</th>
                <th className="text-right font-normal">p95 ms</th>
                <th className="text-right font-normal">batches</th>
              </tr>
            </thead>
            <tbody>
              {[...STAGES, ...SUBSTAGES].map((s) => [s, stage(s)] as const).filter(([, v]) => v).map(([s, v]) => (
                <tr key={s} className="border-t border-[var(--grid)]">
                  <td className={SUBSTAGES.includes(s) ? 'pl-4 text-[var(--ink-2)]' : ''}>{s}</td>
                  <td className="text-right">{fmt(v!.p50, 2)}</td>
                  <td className="text-right">{fmt(v!.p95, 2)}</td>
                  <td className="text-right text-[var(--muted)]">{v!.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
