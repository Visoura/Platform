import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, HorizontalBars, StackedStages } from '../components/charts';
import { api, type BenchReport, type BenchState, type EngineState } from '../lib/api';
import { usePoll } from '../lib/hooks';

const STAGES = ['grab', 'detect', 'track', 'embed', 'match', 'publish'];

export function BenchmarkPage({ state }: { state: EngineState }) {
  const [frames, setFrames] = useState(300);
  const [bench, refreshBench] = usePoll<BenchState>(api.bench, 1000);
  const [reports, refreshReports] = usePoll<BenchReport[]>(api.reports, 10000);

  useEffect(() => {
    if (bench && !bench.running) refreshReports();
  }, [bench?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      await api.startBench(frames);
      refreshBench();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const runs = (reports ?? []).slice(0, 12);
  const label = (r: BenchReport) => `${r.id.slice(4, 8)}-${r.id.slice(9, 13)} ${r.device}`;

  return (
    <div className="space-y-4 p-4">
      <Card
        title="Benchmark"
        subtitle={`Reads the sub-stream files directly, as fast as possible (no RTSP pacing), so runs are repeatable and comparable across machines. The live pipeline pauses while it runs. ${state.cameras.length} cameras.`}
      >
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            frames per camera
            <input type="number" value={frames} min={30} onChange={(e) => setFrames(Number(e.target.value))} className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--ink)]" />
          </label>
          <button onClick={start} disabled={bench?.running} className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white disabled:opacity-50">
            {bench?.running ? 'Running…' : 'Run benchmark'}
          </button>
          {bench?.error && <span className="text-xs text-[var(--critical)]">{bench.error}</span>}
        </div>
      </Card>

      {runs.length > 0 && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Throughput per run" subtitle="Source frames processed per second across all cameras. Label = how many cameras at their native fps this machine can keep up with.">
              <HorizontalBars data={runs.map((r) => ({ name: label(r), value: r.throughput_fps, label: `${r.realtime_cameras.toFixed(1)} cams` }))} unit="fps" valueLabel />
            </Card>
            <Card title="Where the time goes" subtitle="Milliseconds of each stage per analyzed frame. This is what is left to optimize.">
              <StackedStages data={runs.map((r) => ({ name: label(r), ...Object.fromEntries(STAGES.map((s) => [s, r.stage_ms_per_frame[s] ?? 0])) }))} stages={STAGES} unit="ms" />
            </Card>
          </div>
          <Card title="All runs" subtitle="det / emb / match are per analyzed frame. reid and crop are the two parts of embed.">
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--muted)]">
                  <tr className="text-right">
                    <th className="text-left font-normal">run</th>
                    <th className="text-left font-normal">machine</th>
                    <th className="font-normal">cams</th>
                    <th className="font-normal">fps</th>
                    <th className="font-normal">rt cams</th>
                    <th className="font-normal">CPU %</th>
                    <th className="font-normal">det</th>
                    <th className="font-normal">emb</th>
                    <th className="font-normal">match</th>
                    <th className="font-normal">detect ms</th>
                    <th className="font-normal">reid ms</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--grid)] text-right">
                      <td className="text-left">{r.id}</td>
                      <td className="text-left text-[var(--muted)]">{r.gpu} · {r.detector}</td>
                      <td>{r.cameras.length}</td>
                      <td>{r.throughput_fps.toFixed(1)}</td>
                      <td>{r.realtime_cameras.toFixed(2)}</td>
                      <td>{r.cpu_percent.toFixed(0)}</td>
                      <td>{r.detections_per_frame.toFixed(1)}</td>
                      <td>{r.embeddings_per_frame.toFixed(2)}</td>
                      <td>{r.matches_per_frame.toFixed(2)}</td>
                      <td>{(r.stage_ms_per_frame.detect ?? 0).toFixed(2)}</td>
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
