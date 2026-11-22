import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { EyeLogo } from './components/eye-logo';
import { StatusBar } from './components/status-bar';
import { useEngineState } from './lib/hooks';
import { LivePage } from './pages/live';
import { PipelinePage } from './pages/pipeline';
import { BenchmarkPage } from './pages/benchmark';

const tabs = [
  { to: '/', label: 'Live' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/benchmark', label: 'Benchmark' },
];

export default function App() {
  const [state] = useEngineState();

  return (
    <BrowserRouter>
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
          <StatusBar state={state} />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          {!state ? (
            <div className="p-8 text-[var(--muted)]">Connecting to the engine…</div>
          ) : (
            <Routes>
              <Route path="/" element={<LivePage state={state} />} />
              <Route path="/pipeline" element={<PipelinePage state={state} />} />
              <Route path="/benchmark" element={<BenchmarkPage state={state} />} />
            </Routes>
          )}
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </BrowserRouter>
  );
}
