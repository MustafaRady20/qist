import { describe, expect, it } from "vitest";
import { addMonths, buildFlatSchedule, flatProfit } from "./schedule";

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

describe("helpers", () => {
  it("flatProfit", () => expect(flatProfit(2_500_000, 3_000, 6)).toBe(375_000));
  it("addMonths clamps to month end and handles leap years", () => {
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  });
});
