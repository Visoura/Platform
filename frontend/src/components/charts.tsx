import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';

export const STAGE_COLORS: Record<string, string> = {
  grab: 'var(--series-1)',
  detect: 'var(--series-2)',
  track: 'var(--series-3)',
  embed: 'var(--series-4)',
  match: 'var(--series-5)',
  publish: 'var(--series-6)',
};

const axis = { stroke: 'var(--axis)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false };
const tooltipStyle = {
  contentStyle: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 },
  labelStyle: { color: 'var(--ink-2)' },
  itemStyle: { color: 'var(--ink)' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mb-3 text-xs text-[var(--muted)]">{subtitle}</p>}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export function HorizontalBars({ data, unit, valueLabel }: { data: { name: string; value: number; label?: string }[]; unit: string; valueLabel?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 26 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" {...axis} unit={unit} />
        <YAxis type="category" dataKey="name" {...axis} width={130} interval={0} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} ${unit}`, '']} />
        <Bar dataKey="value" fill="var(--series-1)" barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {valueLabel && <LabelList dataKey="label" position="right" fill="var(--ink-2)" fontSize={11} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedStages({ data, stages, unit }: { data: Record<string, number | string>[]; stages: string[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 26 + 60)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" {...axis} unit={unit} />
        <YAxis type="category" dataKey="name" {...axis} width={130} interval={0} />
        <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`${v.toFixed(2)} ${unit}`, name]} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)' }} iconType="rect" iconSize={10} />
        {stages.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            stackId="a"
            fill={STAGE_COLORS[s]}
            stroke="var(--surface)"
            strokeWidth={2}
            barSize={16}
            radius={i === stages.length - 1 ? [0, 4, 4, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TimeLines({ data, series }: { data: Record<string, number>[]; series: { key: string; label: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="t" {...axis} tickFormatter={(t) => `${t}s`} />
        <YAxis {...axis} width={40} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--axis)' }} labelFormatter={(t) => `${t}s ago`} formatter={(v: number, name: string) => [v.toFixed(1), name]} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)' }} iconType="plainline" />
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
