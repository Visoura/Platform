import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { CameraTile } from '../components/camera-tile';
import { TargetsPanel } from '../components/targets-panel';
import type { Candidate } from '../engine/engine';
import type { Box } from '../engine/types';
import { useEngine } from '../lib/hooks';

interface Selection {
  token: string;
  camera: string;
  candidates: Candidate[];
}

export function LivePage() {
  const engine = useEngine();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const columns = Math.ceil(Math.sqrt(engine.cameras.length || 1));

  useEffect(() => engine.onAlert((name, camera) => toast(`${name} seen on ${camera}`)), [engine]);

  const onClick = useCallback(
    async (camera: string, x: number, y: number, hit: Box | null) => {
      if (hit?.target) {
        setSelectedTarget(hit.target);
        return;
      }
      if (engine.status !== 'running') return;
      const result = await engine.click(camera, x, y);
      if (result.status !== 'ok') {
        toast(result.status === 'no_detection' ? 'No person there' : 'Frame not available, try again');
        return;
      }
      setSelection({ token: result.token, camera, candidates: result.candidates });
    },
    [engine],
  );

  const track = async (index: number) => {
    if (!selection) return;
    try {
      const t = await engine.track(selection.token, index);
      toast.success(`Tracking ${t.name}`);
    } catch (e) {
      toast.error(String(e));
    }
    setSelection(null);
  };

  return (
    <div className="flex h-full max-md:flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--ink-2)]">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-2 py-1 hover:bg-[var(--axis)]">
            <FolderOpen size={12} /> Open videos
          </button>
          <input ref={fileRef} type="file" accept="video/*" multiple hidden onChange={(e) => e.target.files && engine.openVideos([...e.target.files])} />
          <span>{engine.cameras.length} cameras · everything runs in this browser</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            show all detections
          </label>
          {engine.backend.startsWith('WASM') && (
            <span className="text-[var(--warning)]">No WebGPU in this browser, so the models run on the CPU and only a few frames per second get analyzed. Chrome, Edge or Safari 26+ use the GPU.</span>
          )}
          {engine.status !== 'running' && (
            <span className={engine.status === 'error' ? 'text-[var(--critical)]' : 'text-[var(--warning)]'}>
              {engine.status}
              {engine.message ? `: ${engine.message}` : ''}
            </span>
          )}
        </div>
        {engine.cameras.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
            <p>No videos yet. Open one video file per camera, any number.</p>
            <p className="text-xs">The files are played and analyzed locally and never uploaded.</p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
            {engine.cameras.map((c) => (
              <CameraTile key={c.id + c.url} camera={c} showAll={showAll} onClick={onClick} />
            ))}
          </div>
        )}
      </div>
      <TargetsPanel targets={engine.targets} selected={selectedTarget} onSelect={setSelectedTarget} />
      {selection && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setSelection(null)}>
          <div className="w-96 max-w-[calc(100vw-32px)] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold">Track this person?</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {selection.candidates.length > 1 ? 'The click overlaps several people, pick one.' : `Clicked on ${selection.camera}.`}
            </p>
            <div className="flex flex-wrap gap-3">
              {selection.candidates.map((c) => (
                <button key={c.index} onClick={() => track(c.index)} className="flex flex-col items-center gap-1 rounded-md border border-[var(--border)] p-2 hover:border-[var(--accent)]">
                  <img src={c.thumb} className="h-32 rounded object-contain" />
                  <span className="text-xs">{c.name ? `already: ${c.name}` : 'Start tracking'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
