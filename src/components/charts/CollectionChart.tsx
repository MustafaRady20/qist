export type MonthlyBars = { month: number; expected: number; actual: number };

// Bars are drawn from piastres; labels read in thousands of pounds.
const thousands = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const nf = { format: (piastres: number) => thousands.format(piastres / 100_000) };

/**
 * Figma: "التحصيل الفعلي مقابل المتوقع" — grouped bars per month, expected in
 * `border` gray, actual in `accent`. The gray has low contrast on white, so each
 * month has a hover/focus tooltip with both values and there is an sr-only table.
 */
export function CollectionChart({
  months,
  year,
  unit = "بالألف جنيه",
  note,
}: {
  /** Amounts in piastres. */
  months: MonthlyBars[];
  year: number;
  unit?: string;
  note?: string;
}) {
  const max = Math.max(...months.flatMap((m) => [m.expected, m.actual]), 1);

  return (
    <figure className="flex flex-col gap-4">
      {/* Months run left-to-right as in the design. */}
      <div dir="ltr" className="flex h-65 items-end gap-3">
        {months.map((m) => (
          <div
            key={m.month}
            tabIndex={0}
            role="img"
            aria-label={`شهر ${m.month}: الفعلي ${nf.format(m.actual)}، المتوقع ${nf.format(m.expected)}`}
            className="group relative flex h-full min-w-0 flex-1 flex-col justify-end gap-2 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-info"
          >
            <div aria-hidden className="flex flex-1 items-end justify-center gap-1">
              <span
                className="w-full max-w-6 rounded-t-[4px] bg-border transition-opacity group-hover:opacity-80"
                style={{ height: `${(m.expected / max) * 100}%` }}
              />
              <span
                className="w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
                style={{ height: `${(m.actual / max) * 100}%` }}
              />
            </div>
            <span aria-hidden className="text-caption text-center text-secondary">
              {m.month}
            </span>
            <div
              aria-hidden
              dir="rtl"
              className="text-caption pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 flex-col gap-1 rounded-control bg-navy px-3 py-2 text-surface shadow-card group-hover:flex group-focus-visible:flex"
            >
              <span className="text-label">شهر {m.month}</span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-[2px] bg-accentBg" />
                الفعلي <span className="num">{nf.format(m.actual)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-[2px] bg-border" />
                المتوقع <span className="num">{nf.format(m.expected)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
      <figcaption className="text-caption flex flex-col gap-2 text-secondary">
        <span>
          <span className="num">{year}</span> • {unit}
          {note && <> • {note}</>}
        </span>
        <span className="flex gap-4">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-[2px] bg-accent" /> الفعلي
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-[2px] bg-border" /> المتوقع
          </span>
        </span>
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>التحصيل الفعلي مقابل المتوقع {year}، {unit}</caption>
          <thead>
            <tr>
              <th scope="col">الشهر</th>
              <th scope="col">المتوقع</th>
              <th scope="col">الفعلي</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{m.month}</th>
                <td>{nf.format(m.expected)}</td>
                <td>{nf.format(m.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
