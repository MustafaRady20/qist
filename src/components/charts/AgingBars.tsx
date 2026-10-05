import { formatAmount } from "@/lib/format";

export type AgingBar = { label: string; amount: number };

/** Figma: "أعمار المتأخرات" — label + amount per band, 8px warning bar scaled to the largest band. */
export function AgingBars({ bands }: { bands: AgingBar[] }) {
  const max = Math.max(...bands.map((b) => b.amount), 1);
  return (
    <ul className="flex flex-col gap-4">
      {bands.map((b) => (
        <li key={b.label} className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-label text-secondary">{b.label}</span>
            <span className="text-body num text-text">{formatAmount(b.amount, { whole: true })}</span>
          </div>
          <span className="h-2 rounded-control bg-bg">
            <span className="block h-full rounded-control bg-warning" style={{ width: `${(b.amount / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
