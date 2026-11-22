import { useEffect, useRef } from 'react';
import { Card, HorizontalBars, StatTile, TimeLines } from '../components/charts';
import type { EngineState } from '../lib/api';
import { useMetrics } from '../lib/hooks';

const STAGES = ['grab', 'detect', 'track', 'embed', 'match', 'publish'];
const SUBSTAGES = ['crop', 'reid'];

const DESIGN = [
  ['grab', 'ingest/', 'Reads the 640px sub-stream over RTSP. A thread per camera keeps only the newest frame, and a sampler lets through {fps} frames per second.'],
  ['detect', 'inference/detector.py', 'One YOLO11n call for every camera at once, person class only, fp16, compiled with {detector}.'],
  ['track', 'tracking/tracker.py', 'ByteTrack gives each person a stable id, so the rest of the pipeline works per person instead of per box.'],
  ['embed', 'inference/crops.py, reid.py', 'Only new tracks, and each track again every 0.5 s, are cropped on the GPU (roi_align) and embedded in fp16. Tiny or cut-off crops are skipped.'],
  ['match', 'matcher.py', 'One matrix multiply against the watchlist in memory. A track keeps its identity with a small hysteresis margin.'],
  ['publish', 'pipeline/pipeline.py', 'Sends only boxes as JSON. The browser plays the video itself over WebRTC from MediaMTX. Sightings go to SQLite in batches.'],
];

export function PipelinePage({ state }: { state: EngineState }) {
  const [metrics] = useMetrics();
  const history = useRef<Record<string, number>[]>([]);

  useEffect(() => {
    if (!metrics) return;
    history.current = [...history.current, { analyzed: metrics.rates.frames_analyzed ?? 0, decoded: metrics.rates.frames_decoded ?? 0 }].slice(-90);
  }, [metrics]);

  const rates = metrics?.rates ?? {};
  const stageData = STAGES.map((s) => ({ name: s, value: metrics?.stages[s]?.mean ?? 0 }));
  const timeline = history.current.map((p, i, all) => ({ t: i - all.length + 1, ...p }));
  const fmt = (v: number | undefined, d = 1) => (v ?? 0).toFixed(d);
  const fill = (text: string) => text.replace('{fps}', String(state.config.analysis_fps)).replace('{detector}', state.config.detector);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(340px,420px)_1fr]">
      <Card title="How this pipeline works" subtitle="Three threads (grab → models → publish) connected by small queues, so decoding, inference and output overlap.">
        <ol className="space-y-3">
          {DESIGN.map(([stage, file, text]) => (
            <li key={stage} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{stage}</span>
                <code className="text-[11px] text-[var(--muted)]">engine/{file}</code>
              </div>
              <p className="text-[var(--ink-2)]">{fill(text)}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile label="Analyzed fps (all cameras)" value={fmt(rates.frames_analyzed)} />
          <StatTile label="Decoded fps" value={fmt(rates.frames_decoded)} />
          <StatTile label="Pipeline latency p50" value={`${fmt(metrics?.latency.p50, 0)} ms`} hint={`p95 ${fmt(metrics?.latency.p95, 0)} ms`} />
          <StatTile label="CPU" value={`${fmt(metrics?.system.cpu_percent, 0)} %`} hint={`${metrics?.system.cores ?? '?'} cores = ${(metrics?.system.cores ?? 0) * 100}%`} />
          <StatTile label="Memory" value={`${fmt(metrics?.system.rss_mb, 0)} MB`} hint={metrics?.system.gpu_mem_mb ? `GPU ${fmt(metrics.system.gpu_mem_mb, 0)} MB` : undefined} />
          <StatTile label="Out to browser" value={`${fmt((rates.bytes_out ?? 0) / 1e3, 1)} KB/s`} hint={`${metrics?.ws_clients ?? 0} clients, ${metrics?.ws_dropped ?? 0} msgs dropped`} />
          <StatTile label="Embeddings / s" value={fmt(rates.embeddings, 1)} hint={`quality skipped ${fmt(rates.quality_skipped, 0)}/s`} />
          <StatTile label="Frames dropped / s" value={fmt(rates.frames_dropped)} hint="old frames the latest-frame reader threw away" />
        </div>

        <Card title="Throughput" subtitle="Frames per second over the last 90 s (all cameras)">
          <TimeLines
            data={timeline}
            series={[
              { key: 'decoded', label: 'decoded', color: 'var(--series-1)' },
              { key: 'analyzed', label: 'analyzed', color: 'var(--series-2)' },
            ]}
          />
        </Card>

        <Card title="Time per stage" subtitle="Mean milliseconds per batch (one frame from each camera). Live, grab includes waiting for the next frame.">
          <HorizontalBars data={stageData} unit="ms" />
        </Card>

        <Card title="Stage details" subtitle="p50 / p95 per call, including the two parts of embed">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="text-left font-normal">stage</th>
                <th className="text-right font-normal">p50 ms</th>
                <th className="text-right font-normal">p95 ms</th>
                <th className="text-right font-normal">calls</th>
              </tr>
            </thead>
            <tbody>
              {[...STAGES, ...SUBSTAGES].filter((s) => metrics?.stages[s]).map((s) => (
                <tr key={s} className="border-t border-[var(--grid)]">
                  <td className={SUBSTAGES.includes(s) ? 'pl-4 text-[var(--ink-2)]' : ''}>{s}</td>
                  <td className="text-right">{fmt(metrics!.stages[s].p50, 2)}</td>
                  <td className="text-right">{fmt(metrics!.stages[s].p95, 2)}</td>
                  <td className="text-right text-[var(--muted)]">{metrics!.stages[s].n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
