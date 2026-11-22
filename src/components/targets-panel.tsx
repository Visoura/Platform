import { useRef, useState } from 'react';
import { History, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { engine, type Target } from '../engine/engine';
import type { Sighting } from '../engine/sightings';

interface Props {
  targets: Target[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function TargetsPanel({ targets, selected, onSelect }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const t = await engine.addPhoto(file, file.name.replace(/\.[^.]+$/, ''));
      toast.success(`Watching for ${t.name}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 max-md:w-full max-md:border-l-0 max-md:border-t flex-col gap-3 overflow-auto border-l border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tracked people</h2>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || engine.status !== 'running'}
          className="flex items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs hover:bg-[var(--axis)]"
        >
          <Upload size={12} /> {uploading ? 'Adding…' : 'Search by photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      <p className="text-xs text-[var(--muted)]">
        Red = watchlist (a photo), blue = clicked in a feed. Click a person in any camera to track them. Photos never leave this browser.
      </p>
      {targets.length === 0 && <p className="text-xs text-[var(--muted)]">Nobody tracked yet.</p>}
      {targets.map((t) => (
        <TargetRow key={t.id} target={t} open={selected === t.id} onToggle={() => onSelect(selected === t.id ? null : t.id)} />
      ))}
    </aside>
  );
}

function TargetRow({ target, open, onToggle }: { target: Target; open: boolean; onToggle: () => void }) {
  const [history, setHistory] = useState<Sighting[] | null>(null);

  const toggle = () => {
    onToggle();
    if (!open) setHistory(engine.history(target.id));
  };

  return (
    <div className={`rounded-md border p-2 ${open ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
      <div className="flex items-center gap-2">
        <img src={target.thumb} className="h-12 w-6 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: target.source === 'watchlist' ? 'var(--watchlist)' : 'var(--tracked)' }} />
            {target.name}
          </div>
          <div className="text-xs text-[var(--muted)]">{target.source}</div>
        </div>
        <button onClick={toggle} title="History" className="rounded p-1 text-[var(--ink-2)] hover:bg-[var(--surface-2)]">
          <History size={14} />
        </button>
        <button
          onClick={() => engine.removeTarget(target.id)}
          title="Stop tracking"
          className="rounded p-1 text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {open && history && (
        <ul className="mt-2 space-y-1 text-xs text-[var(--ink-2)]">
          {history.length === 0 && <li className="text-[var(--muted)]">Not seen yet.</li>}
          {history.slice(0, 20).map((s, i) => (
            <li key={i} className="flex justify-between tabular-nums">
              <span>{s.camera}</span>
              <span>{new Date(s.started_at * 1000).toLocaleTimeString()}</span>
              <span className="text-[var(--muted)]">{s.ended_at ? `${(s.ended_at - s.started_at).toFixed(1)}s` : 'visible'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
