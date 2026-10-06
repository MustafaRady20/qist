/**
 * Flat-rate installment schedule (Figma: contract wizard steps 4–5, finance rule).
 *
 *   profit      = profit base × annual rate × months ÷ 12, where the base is the
 *                 principal or, when the contract says so, the full purchase cost
 *   installment = (principal + profit + fees) ÷ count, rounded to the piastre;
 *                 the rounding difference is settled in the last installment.
 *
 * Installments may be set manually; the ones left out share what remains of
 * the total equally, with the rounding difference in the last of them.
 *
 * Each installment's principal (and fees) portion uses cumulative rounding, so
 * the opening/closing principal columns are exact and sum to the principal.
 * All amounts are integer piastres; rates are basis points.
 */

/** A manually set installment. */
export type CustomInstallment = { seq: number; amount: number };

export type ScheduleInput = {
  principal: number;
  annualRateBp: number;
  termMonths: number;
  /** Monthly installments; defaults to one per month. */
  installmentCount?: number;
  fees?: number;
  /** ISO date (YYYY-MM-DD) of the first installment. */
  firstDueDate: string;
  /** Amount the rate is charged on; defaults to the principal. */
  profitOn?: number;
  /** Manually set installments; the others are calculated. */
  customInstallments?: CustomInstallment[];
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
  /** Regular calculated installment (the manual ones and possibly the last differ). */
  installment: number;
  rows: ScheduleRow[];
};

export function flatProfit(principal: number, annualRateBp: number, termMonths: number): number {
  return Math.round((principal * annualRateBp * termMonths) / (10_000 * 12));
}

/**
 * Why manual amounts cannot make a schedule of `count` installments adding up
 * to `total`; null when they can. `difference` is what is missing (+) or in excess (−).
 */
export function customAmountsIssue(total: number, count: number, amounts: number[]) {
  const rest = total - amounts.reduce((a, b) => a + b, 0);
  const auto = count - amounts.length;
  // Every installment is manual: nothing is left to absorb a difference.
  if (auto === 0) return rest === 0 ? null : { kind: "mismatch" as const, difference: rest };
  // The calculated installments need at least a piastre each.
  return rest >= auto ? null : { kind: "exceeds" as const, difference: rest };
}

export function buildFlatSchedule(input: ScheduleInput): Schedule {
  const { principal, annualRateBp, termMonths, firstDueDate } = input;
  const fees = input.fees ?? 0;
  const count = input.installmentCount ?? termMonths;
  const profitOn = input.profitOn ?? principal;

  assertInt("principal", principal, 1);
  assertInt("annualRateBp", annualRateBp, 0);
  assertInt("termMonths", termMonths, 1);
  assertInt("installmentCount", count, 1);
  assertInt("fees", fees, 0);
  assertInt("profitOn", profitOn, 1);

  const custom = new Map<number, number>();
  for (const c of input.customInstallments ?? []) {
    assertInt("customInstallments.seq", c.seq, 1);
    assertInt("customInstallments.amount", c.amount, 1);
    if (c.seq > count || custom.has(c.seq)) throw new RangeError(`Invalid manual installment #${c.seq}`);
    custom.set(c.seq, c.amount);
  }

  const profit = flatProfit(profitOn, annualRateBp, termMonths);
  const total = principal + profit + fees;
  if (customAmountsIssue(total, count, [...custom.values()])) {
    throw new RangeError("Manual installments do not fit the contract total");
  }

  const autoCount = count - custom.size;
  const autoTotal = total - [...custom.values()].reduce((a, b) => a + b, 0);
  const installment = Math.round(autoCount ? autoTotal / autoCount : total / count);
  let lastAuto = count;
  while (custom.has(lastAuto)) lastAuto--;

  const rows: ScheduleRow[] = [];
  let paidSoFar = 0;
  let principalSoFar = 0;
  let profitSoFar = 0;
  let feesSoFar = 0;
  for (let k = 1; k <= count; k++) {
    const amount = custom.get(k) ?? (k === lastAuto ? autoTotal - installment * (autoCount - 1) : installment);
    paidSoFar += amount;

    let principalPart: number;
    let profitPart: number;
    let feePart: number;
    if (custom.size === 0) {
      principalPart = cumulativeShare(principal, k, count) - principalSoFar;
      feePart = cumulativeShare(fees, k, count) - feesSoFar;
      profitPart = amount - principalPart - feePart;
    } else {
      // Unequal installments: each carries profit and fees in proportion to its amount.
      profitPart = Math.round(profit * (paidSoFar / total)) - profitSoFar;
      feePart = Math.round(fees * (paidSoFar / total)) - feesSoFar;
      principalPart = amount - profitPart - feePart;
    }

    rows.push({
      seq: k,
      dueDate: addMonths(firstDueDate, k - 1),
      openingPrincipal: principal - principalSoFar,
      principal: principalPart,
      profit: profitPart,
      fees: feePart,
      amount,
      closingPrincipal: principal - principalSoFar - principalPart,
    });
    principalSoFar += principalPart;
    profitSoFar += profitPart;
    feesSoFar += feePart;
  }

  if (rows.some((r) => r.amount < 1 || r.principal < 0 || r.profit < 0)) {
    // Only possible with extreme inputs (e.g. zero rate and large fees rounding, amounts of a few piastres).
    throw new RangeError("Schedule produced a negative portion");
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
