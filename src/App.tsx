import { useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { EyeLogo } from './components/eye-logo';
import { useEngine } from './lib/hooks';
import { BenchmarkPage } from './pages/benchmark';
import { LivePage } from './pages/live';
import { PipelinePage } from './pages/pipeline';

const tabs = [
  { to: '/', label: 'Live' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/benchmark', label: 'Benchmark' },
];

const statusColor: Record<string, string> = {
  running: 'var(--good)',
  loading: 'var(--warning)',
  benchmarking: 'var(--warning)',
  idle: 'var(--muted)',
  error: 'var(--critical)',
};

function StatusBar() {
  const engine = useEngine();
  const analyzed = engine.metrics.rates.frames_analyzed ?? 0;
  const latency = engine.metrics.stage('latency')?.p50 ?? 0;
  return (
    <div className="ml-auto flex items-center gap-5 text-xs text-[var(--ink-2)] max-md:hidden">
      <Stat label="analyzed" value={`${analyzed.toFixed(0)} fps`} />
      <Stat label="latency" value={`${latency.toFixed(0)} ms`} />
      {engine.backend && <Stat label="runtime" value={`${engine.backend} · ${engine.adapter}`} />}
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: statusColor[engine.status] }} />
        {engine.status}
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

export default function App() {
  const engine = useEngine();

  useEffect(() => {
    engine.start();
  }, [engine]);

  return (
    <HashRouter>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-6 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
          <div className="flex items-center gap-2">
            <EyeLogo className="h-5 w-auto" />
            <span className="text-sm font-semibold tracking-wide">VISOURA</span>
          </div>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-[var(--surface-2)] text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink-2)]'}`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <StatusBar />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/benchmark" element={<BenchmarkPage />} />
          </Routes>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </HashRouter>
  );
}
