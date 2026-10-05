/**
 * Reporting periods. A range is a pair of inclusive Cairo business dates
 * (YYYY-MM-DD); all arithmetic is done on calendar dates, never on instants.
 */

export type DateRange = { from: string; to: string };

export const periodPresets = ["today", "week", "month", "quarter", "year", "custom"] as const;
export type PeriodPreset = (typeof periodPresets)[number];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO.test(v) && !Number.isNaN(toUtc(v).getTime()) && iso(toUtc(v)) === v;
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

function monthRange(year: number, month: number, months = 1): DateRange {
  return {
    from: iso(new Date(Date.UTC(year, month, 1))),
    to: iso(new Date(Date.UTC(year, month + months, 0))),
  };
}

/**
 * Resolves a preset to dates. Weeks run Saturday–Friday (Egyptian business
 * week). An invalid or missing custom range falls back to the current month.
 */
export function resolveRange(preset: PeriodPreset, today: string, custom: { from?: unknown; to?: unknown } = {}): DateRange {
  const d = toUtc(today);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const from = addDays(today, -((d.getUTCDay() + 1) % 7));
      return { from, to: addDays(from, 6) };
    }
    case "quarter":
      return monthRange(year, month - (month % 3), 3);
    case "year":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case "custom":
      if (isIsoDate(custom.from) && isIsoDate(custom.to) && custom.from <= custom.to) {
        return { from: custom.from, to: custom.to };
      }
      return monthRange(year, month);
    default:
      return monthRange(year, month);
  }
}

/**
 * The period just before `range`: whole calendar months step back by the same
 * number of months (October → September); anything else by its length in days.
 */
export function previousRange(range: DateRange): DateRange {
  const from = toUtc(range.from);
  const end = toUtc(range.to);
  const wholeMonths = from.getUTCDate() === 1 && toUtc(addDays(range.to, 1)).getUTCDate() === 1;
  if (wholeMonths) {
    const months = (end.getUTCFullYear() - from.getUTCFullYear()) * 12 + end.getUTCMonth() - from.getUTCMonth() + 1;
    return monthRange(from.getUTCFullYear(), from.getUTCMonth() - months, months);
  }
  const to = addDays(range.from, -1);
  return { from: addDays(to, -daysBetween(range.from, range.to)), to };
}
