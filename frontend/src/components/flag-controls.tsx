import type { FlagInfo, Flags } from '../lib/api';

interface Props {
  schema: FlagInfo[];
  draft: Flags;
  applied: Flags;
  onChange: (name: string, value: boolean | number | string) => void;
}

export function FlagControls({ schema, draft, applied, onChange }: Props) {
  const groups = [...new Set(schema.map((f) => f.group))];
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{group}</h3>
          <div className="divide-y divide-[var(--grid)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {schema.filter((f) => f.group === group).map((f) => (
              <FlagRow key={f.name} info={f} value={draft[f.name]} changed={draft[f.name] !== applied[f.name]} onChange={(v) => onChange(f.name, v)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FlagRow({ info, value, changed, onChange }: { info: FlagInfo; value: Flags[string]; changed: boolean; onChange: (v: boolean | number | string) => void }) {
  const disabled = Boolean(info.unavailable) && info.kind === 'bool' && !value;
  return (
    <div className={`flex items-start gap-3 px-3 py-2 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          {info.label}
          <code className="text-[10px] text-[var(--muted)]">{info.name}</code>
          {changed && <span className="rounded bg-[var(--warning)] px-1 text-[10px] font-semibold text-black">changed</span>}
        </div>
        <p className="text-xs text-[var(--muted)]">{info.help}</p>
        {info.unavailable && <p className="text-xs text-[var(--warning)]">{info.unavailable}</p>}
      </div>
      {info.kind === 'bool' && (
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      )}
      {info.kind === 'select' && (
        <select
          value={String(value)}
          onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs"
        >
          {info.options!.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
      {info.kind === 'number' && (
        <input
          type="number"
          step="any"
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-right text-xs tabular-nums"
        />
      )}
    </div>
  );
}
