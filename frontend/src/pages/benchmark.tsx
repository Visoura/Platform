import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, HorizontalBars, StackedStages } from '../components/charts';
import { api, type BenchReport, type BenchState, type EngineState, type ReportInfo } from '../lib/api';
import { usePoll } from '../lib/hooks';

const STAGES = ['grab', 'detect', 'track', 'embed', 'match', 'publish'];

export function BenchmarkPage({ state }: { state: EngineState }) {
  const [mode, setMode] = useState('ladder');
  const [frames, setFrames] = useState(300);
  const [bench, refreshBench] = usePoll<BenchState>(api.bench, 1000);
  const [reports, refreshReports] = usePoll<ReportInfo[]>(api.reports, 10000);
  const [reportId, setReportId] = useState<string | null>(null);
  const [report, setReport] = useState<BenchReport | null>(null);

  useEffect(() => {
    if (bench?.report && !bench.running) {
      setReportId(bench.report.id);
      refreshReports();
    }
  }, [bench?.report?.id, bench?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = reportId ?? reports?.[0]?.id;
    if (id) api.report(id).then(setReport);
  }, [reportId, reports]);

  const start = async () => {
    try {
      await api.startBench(mode, frames);
      refreshBench();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const rows = report?.results.filter((r) => !r.skipped) ?? [];

  return (
    <div className="space-y-4 p-4">
      <Card
        title="Benchmark"
        subtitle={`Reads the video files directly, as fast as possible (no RTSP pacing), so runs are repeatable. The live pipeline pauses while it runs. ${state.cameras.length} cameras.`}
      >
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            mode
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--ink)]">
              <option value="ladder">ladder: baseline, then one optimization at a time</option>
              <option value="current">current flags only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            frames per camera
            <input type="number" value={frames} min={30} onChange={(e) => setFrames(Number(e.target.value))} className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--ink)]" />
          </label>
          {bench?.running ? (
            <button onClick={() => api.cancelBench().then(refreshBench)} className="rounded-md bg-[var(--critical)] px-3 py-1.5 font-medium text-white">
              Cancel
            </button>
          ) : (
            <button onClick={start} className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white">
              Run benchmark
            </button>
          )}
          {bench?.running && (
            <div className="flex min-w-64 flex-1 flex-col gap-1">
              <span className="text-xs text-[var(--ink-2)]">
                step {bench.index + 1} / {bench.total}: <code>{bench.step}</code>
              </span>
              <div className="h-1.5 rounded bg-[var(--surface-2)]">
                <div className="h-1.5 rounded bg-[var(--accent)]" style={{ width: `${(100 * (bench.index + 1)) / Math.max(bench.total, 1)}%` }} />
              </div>
            </div>
          )}
          {bench?.error && <span className="text-xs text-[var(--critical)]">{bench.error}</span>}
          {!!reports?.length && (
            <label className="ml-auto flex flex-col gap-1 text-xs text-[var(--muted)]">
              report
              <select value={report?.id ?? ''} onChange={(e) => setReportId(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--ink)]">
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} · {r.mode} · {r.cameras} cams · {r.device}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Card>

      {report && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Throughput per step" subtitle={`Source frames processed per second across all cameras, on ${report.gpu}. Steps are cumulative. Label = speedup vs baseline.`}>
              <HorizontalBars
                data={rows.map((r) => ({ name: r.step, value: r.throughput_fps!, label: `${r.speedup!.toFixed(2)}×` }))}
                unit="fps"
                valueLabel
              />
            </Card>
            <Card title="Where the time goes" subtitle="Milliseconds of each stage per analyzed frame. Shrinking a segment is what an optimization buys.">
              <StackedStages
                data={rows.map((r) => ({ name: r.step, ...Object.fromEntries(STAGES.map((s) => [s, r.stage_ms_per_frame?.[s] ?? 0])) }))}
                stages={STAGES}
                unit="ms"
              />
            </Card>
          </div>
          <Card title="All numbers" subtitle="rt cams = how many cameras at their native fps this config could keep up with. det / emb / match are per analyzed frame, to spot accuracy trade-offs.">
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--muted)]">
                  <tr className="text-right">
                    <th className="text-left font-normal">step</th>
                    <th className="text-left font-normal">change</th>
                    <th className="font-normal">fps</th>
                    <th className="font-normal">speedup</th>
                    <th className="font-normal">rt cams</th>
                    <th className="font-normal">CPU %</th>
                    <th className="font-normal">RSS MB</th>
                    <th className="font-normal">det</th>
                    <th className="font-normal">emb</th>
                    <th className="font-normal">match</th>
                    <th className="font-normal">KB out</th>
                    <th className="font-normal">db commits</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((r) => (
                    <tr key={r.step} className="border-t border-[var(--grid)] text-right">
                      <td className="text-left">{r.step}</td>
                      <td className="text-left text-[var(--muted)]">{Object.entries(r.change).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}</td>
                      {r.skipped ? (
                        <td colSpan={10} className="text-left text-[var(--muted)]">unavailable on this machine, skipped</td>
                      ) : (
                        <>
                          <td>{r.throughput_fps!.toFixed(1)}</td>
                          <td>{r.speedup!.toFixed(2)}×</td>
                          <td>{r.realtime_cameras!.toFixed(2)}</td>
                          <td>{r.cpu_percent!.toFixed(0)}</td>
                          <td>{r.rss_mb?.toFixed(0)}</td>
                          <td>{r.detections_per_frame!.toFixed(1)}</td>
                          <td>{r.embeddings_per_frame!.toFixed(1)}</td>
                          <td>{r.matches_per_frame!.toFixed(2)}</td>
                          <td>{r.kb_out_per_frame!.toFixed(0)}</td>
                          <td>{r.db_commits}</td>
                        </>
                      )}
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
