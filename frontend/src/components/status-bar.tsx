import type { EngineState } from '../lib/api';
import { useFeedStats } from '../lib/hooks';

const statusColor: Record<string, string> = {
  running: 'var(--good)',
  starting: 'var(--warning)',
  benchmarking: 'var(--warning)',
  stopped: 'var(--muted)',
  error: 'var(--critical)',
};

export function StatusBar({ state }: { state: EngineState | null }) {
  const stats = useFeedStats();
  return (
    <div className="ml-auto flex items-center gap-5 text-xs text-[var(--ink-2)]">
      <Stat label="display fps" value={stats.avgFps.toFixed(1)} />
      <Stat label="latency" value={`${Math.max(0, stats.latencyP50).toFixed(0)} ms`} />
      <Stat label="bandwidth" value={`${(stats.bytesPerSec / 1e6).toFixed(2)} MB/s`} />
      {state && <Stat label="device" value={state.capabilities.gpu} />}
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: statusColor[state?.status ?? 'stopped'] }} />
        {state?.status ?? 'offline'}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[var(--muted)]">{label} </span>
      <span className="font-medium text-[var(--ink)] tabular-nums">{value}</span>
    </span>
  );
}
