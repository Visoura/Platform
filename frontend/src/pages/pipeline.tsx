import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, HorizontalBars, StatTile, TimeLines } from '../components/charts';
import { FlagControls } from '../components/flag-controls';
import { api, type EngineState, type Flags } from '../lib/api';
import { useMetrics } from '../lib/hooks';

const STAGES = ['grab', 'detect', 'track', 'embed', 'match', 'publish'];
const SUBSTAGES = ['serialize', 'remote_call', 'crop', 'reid', 'encode', 'db'];

export function PipelinePage({ state, onApplied }: { state: EngineState; onApplied: () => void }) {
  const [draft, setDraft] = useState<Flags>(state.flags);
  const [applying, setApplying] = useState(false);
  const [metrics] = useMetrics();
  const history = useRef<Record<string, number>[]>([]);
  const dirty = Object.keys(draft).some((k) => draft[k] !== state.flags[k]);

  useEffect(() => {
    if (!dirty) setDraft(state.flags);
  }, [state.flags]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!metrics) return;
    history.current = [...history.current, { analyzed: metrics.rates.frames_analyzed ?? 0, decoded: metrics.rates.frames_decoded ?? 0 }].slice(-90);
  }, [metrics]);

  const apply = async () => {
    setApplying(true);
    try {
      const next = await api.applyFlags(draft);
      setDraft(next.flags);
      onApplied();
      toast.success('Pipeline restarted with the new flags');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setApplying(false);
    }
  };

  const rates = metrics?.rates ?? {};
  const stageData = STAGES.map((s) => ({ name: s, value: metrics?.stages[s]?.mean ?? 0 }));
  const timeline = history.current.map((p, i, all) => ({ t: i - all.length + 1, ...p }));
  const fmt = (v: number | undefined, d = 1) => (v ?? 0).toFixed(d);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(380px,460px)_1fr]">
      <div>
        <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-[var(--page)] py-2">
          <button
            onClick={apply}
            disabled={!dirty || applying}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {applying ? 'Restarting…' : 'Apply & restart'}
          </button>
          <button onClick={() => setDraft(state.flags)} disabled={!dirty} className="rounded-md px-3 py-1.5 text-sm text-[var(--ink-2)] disabled:opacity-40">
            Reset
          </button>
          <span className="ml-auto text-xs text-[var(--muted)]">all off = today's baseline</span>
        </div>
        <FlagControls schema={state.schema} draft={draft} applied={state.flags} onChange={(n, v) => setDraft({ ...draft, [n]: v })} />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile label="Analyzed fps (all cameras)" value={fmt(rates.frames_analyzed)} />
          <StatTile label="Decoded fps" value={fmt(rates.frames_decoded)} />
          <StatTile label="Pipeline latency p50" value={`${fmt(metrics?.latency.p50, 0)} ms`} hint={`p95 ${fmt(metrics?.latency.p95, 0)} ms`} />
          <StatTile label="CPU" value={`${fmt(metrics?.system.cpu_percent, 0)} %`} hint={`${metrics?.system.cores ?? '?'} cores = ${(metrics?.system.cores ?? 0) * 100}%`} />
          <StatTile label="Memory" value={`${fmt(metrics?.system.rss_mb, 0)} MB`} hint={metrics?.system.gpu_mem_mb ? `GPU ${fmt(metrics.system.gpu_mem_mb, 0)} MB` : undefined} />
          <StatTile label="Out to browser" value={`${fmt((rates.bytes_out ?? 0) / 1e6, 2)} MB/s`} hint={`${metrics?.ws_clients ?? 0} clients, ${metrics?.ws_dropped ?? 0} msgs dropped`} />
          <StatTile label="Embeddings / s" value={fmt(rates.embeddings, 0)} hint={`matcher queries ${fmt(rates.matcher_queries, 0)}/s`} />
          <StatTile label="Frames dropped / s" value={fmt(rates.frames_dropped)} hint={`detector skipped ${fmt(rates.detector_skipped)}/s`} />
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

        <Card title="Time per stage" subtitle="Mean milliseconds per batch (one frame from each camera). In live mode grab includes waiting for the next frame.">
          <HorizontalBars data={stageData} unit="ms" />
        </Card>

        <Card title="Stage details" subtitle="p50 / p95 per call, including sub-stages">
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
