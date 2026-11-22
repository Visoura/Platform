import { useState } from 'react';
import { Card, HorizontalBars, StackedStages } from '../components/charts';
import { ANALYSIS_FPS } from '../engine/config';
import type { BenchRun } from '../engine/engine';
import { useEngine } from '../lib/hooks';

const STAGES = ['detect', 'track', 'embed', 'match'];

export function BenchmarkPage() {
  const engine = useEngine();
  const [frames, setFrames] = useState(50);
  const runs = engine.benchRuns;
  const label = (r: BenchRun) => `${r.id.slice(5, 16)} ${r.backend}`;
  const busy = engine.status === 'benchmarking';

  return (
    <div className="space-y-4 p-4">
      <Card
        title="Benchmark"
        subtitle={`Captures ${frames} frames from each video (${ANALYSIS_FPS} per second of video), then runs detect, track, embed and match on them as fast as this browser can. Video decoding is not included. Results stay in this browser.`}
      >
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            frames per camera
            <input type="number" value={frames} min={10} max={200} onChange={(e) => setFrames(Number(e.target.value))} className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--ink)]" />
          </label>
          <button
            onClick={() => engine.benchmark(frames)}
            disabled={engine.status !== 'running' || !engine.cameras.length}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Run benchmark'}
          </button>
          {busy && <span className="text-xs text-[var(--ink-2)]">{engine.message}</span>}
          {engine.benchError && <span className="text-xs text-[var(--critical)]">{engine.benchError}</span>}
        </div>
      </Card>

      {runs.length > 0 && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Throughput per run" subtitle={`Analyzed frames per second across all cameras. Label = how many cameras analyzed at ${ANALYSIS_FPS} fps this browser could keep up with.`}>
              <HorizontalBars data={runs.map((r) => ({ name: label(r), value: r.analyzed_fps, label: `${r.cameras_at_analysis_fps.toFixed(1)} cams` }))} unit="fps" valueLabel />
            </Card>
            <Card title="Where the time goes" subtitle="Milliseconds of each stage per analyzed frame">
              <StackedStages data={runs.map((r) => ({ name: label(r), ...Object.fromEntries(STAGES.map((s) => [s, r.stage_ms_per_frame[s] ?? 0])) }))} stages={STAGES} unit="ms" />
            </Card>
          </div>
          <Card title="All runs" subtitle="det / emb / match are per analyzed frame. crop and reid are the two parts of embed.">
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--muted)]">
                  <tr className="text-right">
                    <th className="text-left font-normal">run</th>
                    <th className="text-left font-normal">runtime</th>
                    <th className="font-normal">cams</th>
                    <th className="font-normal">fps</th>
                    <th className="font-normal">cams @ {ANALYSIS_FPS}</th>
                    <th className="font-normal">det</th>
                    <th className="font-normal">emb</th>
                    <th className="font-normal">match</th>
                    <th className="font-normal">detect ms</th>
                    <th className="font-normal">crop ms</th>
                    <th className="font-normal">reid ms</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--grid)] text-right">
                      <td className="text-left">{r.id}</td>
                      <td className="text-left text-[var(--muted)]">{r.backend} · {r.adapter}</td>
                      <td>{r.cameras}</td>
                      <td>{r.analyzed_fps.toFixed(1)}</td>
                      <td>{r.cameras_at_analysis_fps.toFixed(1)}</td>
                      <td>{r.detections_per_frame.toFixed(1)}</td>
                      <td>{r.embeddings_per_frame.toFixed(2)}</td>
                      <td>{r.matches_per_frame.toFixed(2)}</td>
                      <td>{(r.stage_ms_per_frame.detect ?? 0).toFixed(2)}</td>
                      <td>{(r.stage_ms_per_frame.crop ?? 0).toFixed(2)}</td>
                      <td>{(r.stage_ms_per_frame.reid ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
