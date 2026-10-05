/**
 * Early-settlement quote (Figma "settlement"), policy "إعفاء العائد المستقبلي":
 *
 *   amount = remaining principal + profit already due + outstanding fees
 *
 * The profit of installments not yet due is forgiven. Profit is flat per
 * installment, so "already due" means installments dated today or earlier.
 * Money already paid on an installment covers its fees first, then its profit,
 * then its principal. All amounts are integer piastres.
 */

export type SettlementRow = {
  seq: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  principal: number;
  profit: number;
  fees: number;
  paidAmount: number;
};

export type SettlementQuote = {
  remainingPrincipal: number;
  accruedProfit: number;
  /** Forgiven by the policy; shown in the breakdown but not charged. */
  futureProfit: number;
  outstandingFees: number;
  amount: number;
  /** What settling does to each open installment: `pay` is received, `waive` is cancelled. */
  allocations: { seq: number; pay: number; waive: number }[];
};

export function quoteSettlement(rows: SettlementRow[], today: string): SettlementQuote {
  const quote: SettlementQuote = { remainingPrincipal: 0, accruedProfit: 0, futureProfit: 0, outstandingFees: 0, amount: 0, allocations: [] };

  for (const r of rows) {
    const fees = Math.max(0, r.fees - r.paidAmount);
    const profit = Math.max(0, r.profit - Math.max(0, r.paidAmount - r.fees));
    const principal = r.principal - Math.max(0, r.paidAmount - r.fees - r.profit);
    if (fees + profit + principal === 0) continue;

    const future = r.dueDate > today;
    quote.remainingPrincipal += principal;
    quote.outstandingFees += fees;
    if (future) quote.futureProfit += profit;
    else quote.accruedProfit += profit;
    quote.allocations.push({ seq: r.seq, pay: principal + fees + (future ? 0 : profit), waive: future ? profit : 0 });
  }

  quote.amount = quote.remainingPrincipal + quote.accruedProfit + quote.outstandingFees;
  return quote;
}
