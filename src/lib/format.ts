/**
 * Financial and date formatting per the Foundations frame:
 * - Amounts: 2 decimals, Latin digits, grouped ("12,450.00"). Currency is a
 *   separate label, never part of the number.
 * - Dates: DD MMM YYYY with Arabic month names ("01 أكتوبر 2026").
 * - Money is handled in piastres (integer minor units) to avoid float drift.
 */

export const CURRENCY = "EGP";
export const CURRENCY_LABEL_AR = "ج.م";

const amountFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeAmountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** "12,450.00"; pass `{ whole: true }` for summary figures ("4,850,000"). */
export function formatAmount(piastres: number, { whole = false } = {}): string {
  return (whole ? wholeAmountFormat : amountFormat).format(piastres / 100);
}

/** Rounds a pound amount to the nearest piastre, returning piastres. */
export function toPiastres(pounds: number): number {
  return Math.round(pounds * 100);
}

/**
 * Wraps a number or range in a Unicode LTR isolate so "8–30" is never
 * reordered to "30–8" inside RTL text (for plain-string labels; in JSX prefer
 * the `num` class).
 */
export function ltr(text: string | number): string {
  return `\u2066${text}\u2069`;
}

/** "01001234567" → "0100 123 4567" (render inside a `num` span). */
export function formatPhone(phone: string): string {
  return /^\d{11}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

/** Arabic count agreement: 1 "عقد نشط", 2 "عقدان نشطان", 3–10 "3 عقود نشطة", 11+ "11 عقدًا نشطًا". */
export function activeContractsLabel(n: number): string {
  if (n === 0) return "لا عقود نشطة";
  if (n === 1) return "عقد نشط";
  if (n === 2) return "عقدان نشطان";
  return n <= 10 ? `${n} عقود نشطة` : `${n} عقدًا نشطًا`;
}

/** "عقد", "عقدان", "3 عقود", "11 عقدًا". */
export function contractsCountLabel(n: number): string {
  if (n === 1) return "عقد واحد";
  if (n === 2) return "عقدان";
  return n >= 3 && n <= 10 ? `${n} عقود` : `${n} عقدًا`;
}

/** "قسط واحد", "قسطان", "6 أقساط", "12 قسطًا". */
export function installmentsCountLabel(n: number): string {
  if (n === 1) return "قسط واحد";
  if (n === 2) return "قسطان";
  return n <= 10 ? `${n} أقساط` : `${n} قسطًا`;
}

/** "عميل واحد", "عميلان", "5 عملاء", "47 عميلًا". */
export function customersCountLabel(n: number): string {
  if (n === 1) return "عميل واحد";
  if (n === 2) return "عميلان";
  return n >= 3 && n <= 10 ? `${n} عملاء` : `${n} عميلًا`;
}

/** "يوم واحد", "يومان", "7 أيام", "26 يومًا". */
export function daysCountLabel(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  return n >= 3 && n <= 10 ? `${n} أيام` : `${n} يومًا`;
}

/** Parses a typed pound amount ("12,500" / "5833.33") into piastres; null when it is not a valid amount. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[,\s]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(clean) ? toPiastres(Number(clean)) : null;
}

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}

// Business dates are Cairo dates wherever the code runs (servers are usually UTC).
const TZ = "Africa/Cairo";
const monthsAr = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", timeZone: TZ });
const weekdayAr = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", timeZone: TZ });
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Accepts a Date or an ISO date ("2026-10-01", read as that calendar day). */
function cairoParts(date: Date | string) {
  const d = typeof date === "string" ? new Date(date.length === 10 ? `${date}T12:00:00Z` : date) : date;
  const [year, , day] = ymd.format(d).split("-");
  return { d, year, day, dayNumber: Number(day) };
}

export function formatDate(date: Date | string): string {
  const { d, year, day } = cairoParts(date);
  return `${day} ${monthsAr.format(d)} ${year}`;
}

/** "27 سبتمبر" — table cells where the year is implied. */
export function formatDayMonth(date: Date | string): string {
  const { d, day } = cairoParts(date);
  return `${day} ${monthsAr.format(d)}`;
}

/** "الأحد، 27 سبتمبر 2026" — page subtitles. */
export function formatDateLong(date: Date | string): string {
  const { d, year, dayNumber } = cairoParts(date);
  return `${weekdayAr.format(d)}، ${dayNumber} ${monthsAr.format(d)} ${year}`;
}

/**
 * Splits a financed amount into equal installments rounded to the piastre;
 * the rounding difference is settled in the last installment.
 * The down payment is separate and must not be included in `financedPiastres`.
 */
export function splitInstallments(
  financedPiastres: number,
  count: number,
): number[] {
  if (!Number.isInteger(financedPiastres) || financedPiastres < 0) {
    throw new RangeError("financedPiastres must be a non-negative integer");
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("count must be a positive integer");
  }
  const base = Math.round(financedPiastres / count);
  const installments = Array<number>(count).fill(base);
  installments[count - 1] = financedPiastres - base * (count - 1);
  return installments;
}
