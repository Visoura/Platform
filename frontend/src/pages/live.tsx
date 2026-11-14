import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CameraTile } from '../components/camera-tile';
import { TargetsPanel } from '../components/targets-panel';
import { api, type Candidate, type EngineState, type Target } from '../lib/api';
import { feed, type Box } from '../lib/feed';
import { usePoll } from '../lib/hooks';

interface Selection {
  token: string;
  camera: string;
  candidates: Candidate[];
}

export function LivePage({ state }: { state: EngineState }) {
  const [targets, refreshTargets] = usePoll<Target[]>(api.targets, 3000);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const webrtc = state.flags.video_out === 'webrtc';
  const columns = Math.ceil(Math.sqrt(state.cameras.length || 1));

  useEffect(() => {
    feed.connect();
    return feed.onAlert((a) => toast(`${a.name} seen on ${a.camera}`));
  }, []);

  const onClick = useCallback(async (camera: string, index: number, x: number, y: number, hit: Box | null) => {
    if (hit?.target) {
      setSelectedTarget(hit.target);
      return;
    }
    const result = await api.click(camera, index, x, y);
    if (result.status !== 'ok') {
      toast(result.status === 'no_detection' ? 'No person there' : 'Frame not available, try again');
      return;
    }
    setSelection({ token: result.token, camera, candidates: result.candidates });
  }, []);

  const track = async (index: number) => {
    if (!selection) return;
    try {
      const t = await api.track(selection.token, index);
      toast.success(`Tracking ${t.name}`);
      refreshTargets();
    } catch (e) {
      toast.error(String(e));
    }
    setSelection(null);
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-4 text-xs text-[var(--ink-2)]">
          <span>{state.cameras.length} cameras · video: {String(state.flags.video_out)}</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            show all detections
          </label>
          {state.status !== 'running' && <span className="text-[var(--warning)]">engine {state.status}{state.error ? `: ${state.error}` : ''}</span>}
        </div>
        <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
          {state.cameras.map((c) => (
            <CameraTile key={c.id} camera={c} webrtc={webrtc} showAll={showAll} onClick={onClick} />
          ))}
        </div>
      </div>
      <TargetsPanel targets={targets ?? []} selected={selectedTarget} onSelect={setSelectedTarget} onChange={refreshTargets} />
      {selection && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setSelection(null)}>
          <div className="w-96 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold">Track this person?</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {selection.candidates.length > 1 ? 'The click overlaps several people, pick one.' : `Clicked on ${selection.camera}.`}
            </p>
            <div className="flex flex-wrap gap-3">
              {selection.candidates.map((c) => (
                <button key={c.index} onClick={() => track(c.index)} className="flex flex-col items-center gap-1 rounded-md border border-[var(--border)] p-2 hover:border-[var(--accent)]">
                  <img src={`data:image/jpeg;base64,${c.thumb}`} className="h-32 rounded object-contain" />
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
