import { describe, expect, it } from "vitest";
import { addMonths, buildFlatSchedule, customAmountsIssue, flatProfit } from "./schedule";

const EGP = 100;

describe("buildFlatSchedule", () => {
  // Figma "wizard-5": 50,000 principal, 40% flat, 12 months, first due 01/01/2027.
  const s = buildFlatSchedule({
    principal: 50_000 * EGP,
    annualRateBp: 4_000,
    termMonths: 12,
    firstDueDate: "2027-01-01",
  });

  it("matches the design's totals", () => {
    expect(s.profit).toBe(20_000 * EGP);
    expect(s.total).toBe(70_000 * EGP);
    expect(s.installment).toBe(583_333);
  });

  it("reproduces the design's schedule table row for row", () => {
    // [#, due, opening, principal, profit, amount, closing] from the Figma frame.
    const expected = [
      [1, "2027-01-01", 5_000_000, 416_667, 166_666, 583_333, 4_583_333],
      [2, "2027-02-01", 4_583_333, 416_666, 166_667, 583_333, 4_166_667],
      [3, "2027-03-01", 4_166_667, 416_667, 166_666, 583_333, 3_750_000],
      [4, "2027-04-01", 3_750_000, 416_667, 166_666, 583_333, 3_333_333],
      [5, "2027-05-01", 3_333_333, 416_666, 166_667, 583_333, 2_916_667],
      [6, "2027-06-01", 2_916_667, 416_667, 166_666, 583_333, 2_500_000],
      [7, "2027-07-01", 2_500_000, 416_667, 166_666, 583_333, 2_083_333],
      [8, "2027-08-01", 2_083_333, 416_666, 166_667, 583_333, 1_666_667],
      [9, "2027-09-01", 1_666_667, 416_667, 166_666, 583_333, 1_250_000],
      [10, "2027-10-01", 1_250_000, 416_667, 166_666, 583_333, 833_333],
      [11, "2027-11-01", 833_333, 416_666, 166_667, 583_333, 416_667],
      [12, "2027-12-01", 416_667, 416_667, 166_670, 583_337, 0],
    ];
    expect(
      s.rows.map((r) => [r.seq, r.dueDate, r.openingPrincipal, r.principal, r.profit, r.amount, r.closingPrincipal]),
    ).toEqual(expected);
  });

  it("sums exactly", () => {
    const sum = (k: "principal" | "profit" | "amount") => s.rows.reduce((a, r) => a + r[k], 0);
    expect(sum("principal")).toBe(s.principal);
    expect(sum("profit")).toBe(s.profit);
    expect(sum("amount")).toBe(s.total);
  });

  it("spreads fees and keeps every row balanced", () => {
    const f = buildFlatSchedule({ principal: 1_000_001, annualRateBp: 3_000, termMonths: 7, fees: 1_000, firstDueDate: "2026-01-31" });
    expect(f.rows.reduce((a, r) => a + r.fees, 0)).toBe(1_000);
    expect(f.rows.reduce((a, r) => a + r.amount, 0)).toBe(f.total);
    for (const r of f.rows) expect(r.amount).toBe(r.principal + r.profit + r.fees);
    expect(f.rows.map((r) => r.dueDate).slice(0, 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("rejects invalid input", () => {
    expect(() => buildFlatSchedule({ principal: 0, annualRateBp: 4_000, termMonths: 12, firstDueDate: "2027-01-01" })).toThrow();
    expect(() => buildFlatSchedule({ principal: 100.5, annualRateBp: 4_000, termMonths: 12, firstDueDate: "2027-01-01" })).toThrow();
    expect(() => buildFlatSchedule({ principal: 100, annualRateBp: 4_000, termMonths: 12, firstDueDate: "2027-02-30" })).toThrow();
  });
});

describe("profit base", () => {
  // 60,000 price, 10,000 down, 40% flat, 12 months.
  const base = { principal: 50_000 * EGP, annualRateBp: 4_000, termMonths: 12, firstDueDate: "2027-01-01" };

  it("charges the rate on the full price when asked, without financing the down payment", () => {
    const s = buildFlatSchedule({ ...base, profitOn: 60_000 * EGP });
    expect(s.profit).toBe(24_000 * EGP);
    expect(s.total).toBe(74_000 * EGP);
    expect(s.rows.reduce((a, r) => a + r.principal, 0)).toBe(50_000 * EGP);
    expect(s.rows.reduce((a, r) => a + r.profit, 0)).toBe(24_000 * EGP);
    expect(s.rows.at(-1)!.closingPrincipal).toBe(0);
  });
});

describe("manual installments", () => {
  const base = { principal: 50_000 * EGP, annualRateBp: 4_000, termMonths: 12, firstDueDate: "2027-01-01" };
  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);

  it("keeps the manual amounts and shares the rest over the other installments", () => {
    const s = buildFlatSchedule({
      ...base,
      customInstallments: [
        { seq: 1, amount: 10_000 * EGP },
        { seq: 12, amount: 5_000 * EGP },
      ],
    });
    expect(s.total).toBe(70_000 * EGP);
    expect(s.rows[0].amount).toBe(10_000 * EGP);
    expect(s.rows[11].amount).toBe(5_000 * EGP);
    // 55,000 over ten installments.
    expect(s.installment).toBe(5_500 * EGP);
    expect(s.rows.slice(1, 11).every((r) => r.amount === 5_500 * EGP)).toBe(true);
    expect(sum(s.rows)).toBe(s.total);
  });

  it("settles the rounding difference in the last calculated installment", () => {
    const s = buildFlatSchedule({ ...base, customInstallments: [{ seq: 12, amount: 1_000 * EGP }] });
    // 69,000 over eleven installments = 6,272.7272…
    expect(s.rows.slice(0, 10).every((r) => r.amount === 627_273)).toBe(true);
    expect(s.rows[10].amount).toBe(6_900_000 - 627_273 * 10);
    expect(s.rows[11].amount).toBe(1_000 * EGP);
    expect(sum(s.rows)).toBe(s.total);
  });

  it("keeps every row balanced and the columns exact", () => {
    const s = buildFlatSchedule({
      ...base,
      principal: 1_000_001,
      termMonths: 7,
      fees: 1_000,
      customInstallments: [
        { seq: 2, amount: 300_000 },
        { seq: 5, amount: 12_345 },
      ],
    });
    for (const r of s.rows) {
      expect(r.amount).toBe(r.principal + r.profit + r.fees);
      expect(r.profit).toBeGreaterThanOrEqual(0);
      expect(r.closingPrincipal).toBe(r.openingPrincipal - r.principal);
    }
    expect(s.rows.reduce((a, r) => a + r.principal, 0)).toBe(s.principal);
    expect(s.rows.reduce((a, r) => a + r.profit, 0)).toBe(s.profit);
    expect(s.rows.reduce((a, r) => a + r.fees, 0)).toBe(1_000);
    expect(s.rows.at(-1)!.closingPrincipal).toBe(0);
    // A larger installment carries more of the profit.
    expect(s.rows[1].profit).toBeGreaterThan(s.rows[4].profit);
  });

  it("accepts a fully manual schedule only when it adds up to the total", () => {
    const three = { ...base, termMonths: 3, annualRateBp: 0 };
    const amounts = (a: number[]) => a.map((amount, i) => ({ seq: i + 1, amount }));
    expect(buildFlatSchedule({ ...three, customInstallments: amounts([2_000_000, 2_000_000, 1_000_000]) }).rows.map((r) => r.amount)).toEqual([
      2_000_000, 2_000_000, 1_000_000,
    ]);
    expect(() => buildFlatSchedule({ ...three, customInstallments: amounts([2_000_000, 2_000_000, 999_999]) })).toThrow();
  });

  it("rejects amounts that leave nothing for the calculated installments", () => {
    expect(() => buildFlatSchedule({ ...base, customInstallments: [{ seq: 1, amount: 70_000 * EGP }] })).toThrow();
    expect(() => buildFlatSchedule({ ...base, customInstallments: [{ seq: 13, amount: 100 }] })).toThrow();
    expect(() =>
      buildFlatSchedule({
        ...base,
        customInstallments: [
          { seq: 1, amount: 100 },
          { seq: 1, amount: 200 },
        ],
      }),
    ).toThrow();
  });

  it("customAmountsIssue", () => {
    expect(customAmountsIssue(1_000, 3, [])).toBeNull();
    expect(customAmountsIssue(1_000, 3, [998])).toBeNull();
    expect(customAmountsIssue(1_000, 3, [999])).toEqual({ kind: "exceeds", difference: 1 });
    expect(customAmountsIssue(1_000, 3, [500, 300, 100])).toEqual({ kind: "mismatch", difference: 100 });
    expect(customAmountsIssue(1_000, 3, [500, 300, 300])).toEqual({ kind: "mismatch", difference: -100 });
    expect(customAmountsIssue(1_000, 3, [500, 300, 200])).toBeNull();
  });
});

describe("helpers", () => {
  it("flatProfit", () => expect(flatProfit(2_500_000, 3_000, 6)).toBe(375_000));
  it("addMonths clamps to month end and handles leap years", () => {
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  });
});
