import { describe, expect, it } from "vitest";
import { buildFlatSchedule } from "./schedule";
import { quoteSettlement, type SettlementRow } from "./settlement";

// 50,000 EGP over 12 months at 40% flat: profit 20,000, installment 5,833.33.
const schedule = buildFlatSchedule({ principal: 5_000_000, annualRateBp: 4_000, termMonths: 12, firstDueDate: "2026-01-01" });
const rows = (paid: (seq: number, amount: number) => number): SettlementRow[] =>
  schedule.rows.map((r) => ({ seq: r.seq, dueDate: r.dueDate, principal: r.principal, profit: r.profit, fees: r.fees, paidAmount: paid(r.seq, r.amount) }));

// Profit of installments 7–12 (the last one carries the rounding difference).
const secondHalfProfit = schedule.rows.slice(6).reduce((sum, r) => sum + r.profit, 0);

describe("quoteSettlement", () => {
  it("charges remaining principal and forgives future profit", () => {
    // Six installments paid, settled in mid-June: nothing is due yet.
    const q = quoteSettlement(rows((seq, amount) => (seq <= 6 ? amount : 0)), "2026-06-15");
    expect(q.remainingPrincipal).toBe(2_500_000);
    expect(q.accruedProfit).toBe(0);
    expect(q.futureProfit).toBe(secondHalfProfit);
    expect(q.amount).toBe(2_500_000);
    expect(q.allocations).toHaveLength(6);
  });

  it("keeps the profit of installments that are already due", () => {
    // Installments 7 and 8 are due and unpaid on 15 August.
    const q = quoteSettlement(rows((seq, amount) => (seq <= 6 ? amount : 0)), "2026-08-15");
    const dueProfit = schedule.rows[6].profit + schedule.rows[7].profit;
    expect(q.accruedProfit).toBe(dueProfit);
    expect(q.futureProfit).toBe(secondHalfProfit - dueProfit);
    expect(q.amount).toBe(2_500_000 + dueProfit);
  });

  it("applies partial payments to profit before principal", () => {
    const seventh = schedule.rows[6];
    const q = quoteSettlement(rows((seq, amount) => (seq <= 6 ? amount : seq === 7 ? seventh.profit + 100 : 0)), "2026-06-15");
    expect(q.remainingPrincipal).toBe(2_500_000 - 100);
    expect(q.futureProfit).toBe(secondHalfProfit - seventh.profit);
    expect(q.allocations[0]).toEqual({ seq: 7, pay: seventh.principal - 100, waive: 0 });
  });

  it("closes every installment exactly: paid + pay + waive = amount", () => {
    const paid = (seq: number, amount: number) => (seq <= 3 ? amount : seq === 4 ? 123_456 : 0);
    const q = quoteSettlement(rows(paid), "2026-05-10");
    for (const a of q.allocations) {
      const r = schedule.rows[a.seq - 1];
      expect(paid(r.seq, r.amount) + a.pay + a.waive).toBe(r.amount);
    }
    expect(q.allocations.reduce((sum, a) => sum + a.pay, 0)).toBe(q.amount);
  });

  it("is zero for a fully paid contract", () => {
    expect(quoteSettlement(rows((_, amount) => amount), "2026-06-15")).toMatchObject({ amount: 0, allocations: [] });
  });
});
