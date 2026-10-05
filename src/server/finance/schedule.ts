/**
 * Flat-rate installment schedule (Figma: contract wizard steps 4–5, finance rule).
 *
 *   profit      = principal × annual rate × months ÷ 12
 *   installment = (principal + profit + fees) ÷ count, rounded to the piastre;
 *                 the rounding difference is settled in the last installment.
 *
 * Each installment's principal (and fees) portion uses cumulative rounding, so
 * the opening/closing principal columns are exact and sum to the principal.
 * All amounts are integer piastres; rates are basis points.
 */

export type ScheduleInput = {
  principal: number;
  annualRateBp: number;
  termMonths: number;
  /** Monthly installments; defaults to one per month. */
  installmentCount?: number;
  fees?: number;
  /** ISO date (YYYY-MM-DD) of the first installment. */
  firstDueDate: string;
};

export type ScheduleRow = {
  seq: number;
  dueDate: string;
  openingPrincipal: number;
  principal: number;
  profit: number;
  fees: number;
  amount: number;
  closingPrincipal: number;
};

export type Schedule = {
  principal: number;
  profit: number;
  fees: number;
  total: number;
  /** Regular installment (all but possibly the last). */
  installment: number;
  rows: ScheduleRow[];
};

export function flatProfit(principal: number, annualRateBp: number, termMonths: number): number {
  return Math.round((principal * annualRateBp * termMonths) / (10_000 * 12));
}

export function buildFlatSchedule(input: ScheduleInput): Schedule {
  const { principal, annualRateBp, termMonths, firstDueDate } = input;
  const fees = input.fees ?? 0;
  const count = input.installmentCount ?? termMonths;

  assertInt("principal", principal, 1);
  assertInt("annualRateBp", annualRateBp, 0);
  assertInt("termMonths", termMonths, 1);
  assertInt("installmentCount", count, 1);
  assertInt("fees", fees, 0);

  const profit = flatProfit(principal, annualRateBp, termMonths);
  const total = principal + profit + fees;
  const installment = Math.round(total / count);

  const rows: ScheduleRow[] = [];
  let paidSoFar = 0;
  for (let k = 1; k <= count; k++) {
    const last = k === count;
    const amount = last ? total - paidSoFar : installment;
    const principalPart = cumulativeShare(principal, k, count) - cumulativeShare(principal, k - 1, count);
    const feePart = cumulativeShare(fees, k, count) - cumulativeShare(fees, k - 1, count);
    const openingPrincipal = principal - cumulativeShare(principal, k - 1, count);
    rows.push({
      seq: k,
      dueDate: addMonths(firstDueDate, k - 1),
      openingPrincipal,
      principal: principalPart,
      profit: amount - principalPart - feePart,
      fees: feePart,
      amount,
      closingPrincipal: openingPrincipal - principalPart,
    });
    paidSoFar += amount;
  }

  if (rows.some((r) => r.profit < 0)) {
    // Only possible with extreme inputs (e.g. zero rate and large fees rounding).
    throw new RangeError("Schedule produced a negative profit portion");
  }
  return { principal, profit, fees, total, installment, rows };
}

function cumulativeShare(amount: number, k: number, count: number) {
  return Math.round((amount * k) / count);
}

/** Adds calendar months to an ISO date, clamping to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = parseIsoDate(isoDate);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function parseIsoDate(isoDate: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new RangeError(`Invalid date: ${isoDate}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) throw new RangeError(`Invalid date: ${isoDate}`);
  return [y, m, d];
}

function assertInt(name: string, value: number, min: number) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer ≥ ${min}`);
  }
}
