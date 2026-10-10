import { describe, expect, it } from "vitest";
import { allocatePayment, installmentStatus, type OpenInstallment } from "./installments";

const rows = (...paid: number[]): OpenInstallment[] => paid.map((paidAmount, i) => ({ id: `i${i + 1}`, seq: i + 1, amount: 100_000, paidAmount, waivedAmount: 0 }));

describe("allocatePayment", () => {
  it("pays the oldest open installment first", () => {
    expect(allocatePayment(rows(0, 0, 0), 100_000)).toEqual([{ installmentId: "i1", seq: 1, amount: 100_000 }]);
  });

  it("applies a partial payment to the earliest installment only", () => {
    expect(allocatePayment(rows(0, 0), 40_000)).toEqual([{ installmentId: "i1", seq: 1, amount: 40_000 }]);
  });

  it("finishes a partly paid installment before moving on", () => {
    expect(allocatePayment(rows(100_000, 40_000, 0), 90_000)).toEqual([
      { installmentId: "i2", seq: 2, amount: 60_000 },
      { installmentId: "i3", seq: 3, amount: 30_000 },
    ]);
  });

  it("allocates exactly the amount received", () => {
    const parts = allocatePayment(rows(25_000, 0, 0), 275_000);
    expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(275_000);
  });

  it("refuses more than what is owed, and non-positive amounts", () => {
    expect(() => allocatePayment(rows(0, 0), 200_001)).toThrow(RangeError);
    expect(() => allocatePayment(rows(100_000), 1)).toThrow(RangeError);
    expect(() => allocatePayment(rows(0), 0)).toThrow(RangeError);
  });

  it("skips what a settlement waived", () => {
    const waived: OpenInstallment[] = [{ id: "a", seq: 1, amount: 100_000, paidAmount: 80_000, waivedAmount: 20_000 }, ...rows(0).map((r) => ({ ...r, id: "b", seq: 2 }))];
    expect(allocatePayment(waived, 10_000)).toEqual([{ installmentId: "b", seq: 2, amount: 10_000 }]);
  });
});

describe("installmentStatus", () => {
  it("does not treat a scheduled installment as paid", () => {
    expect(installmentStatus({ amount: 100, paidAmount: 0, dueDate: "2026-01-01" }, "2026-02-01")).toBe("overdue");
    expect(installmentStatus({ amount: 100, paidAmount: 0, dueDate: "2026-03-01" }, "2026-02-01")).toBe("upcoming");
    expect(installmentStatus({ amount: 100, paidAmount: 40, dueDate: "2026-01-01" }, "2026-02-01")).toBe("partial");
    expect(installmentStatus({ amount: 100, paidAmount: 100, dueDate: "2026-01-01" }, "2026-02-01")).toBe("paid");
  });
});
