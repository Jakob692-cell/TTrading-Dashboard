import { ProgressBar } from '../ui/primitives';

/** Horizontal share bars (one series, one colour) with the value at the end of each label row. */
export function ShareBars({ items }: { items: { label: string; share: number; count: number }[] }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      {items.map((t) => (
        <div key={t.label} className="stack" style={{ gap: 6 }}>
          <div className="row between" style={{ fontSize: 14 }}>
            <span>{t.label}</span>
            <span className="tabular" style={{ fontWeight: 600 }}>
              {Math.round(t.share * 100)}%
            </span>
          </div>
          <ProgressBar value={t.share} thin label={`${t.label}: ${t.count} check-ins`} />
        </div>
      ))}
    </div>
  );
}
