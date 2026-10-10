import { describe, expect, it } from "vitest";
import { allocatePayment } from "./installments";
import { buildFlatSchedule } from "./schedule";
import { quoteSettlement } from "./settlement";
import { buildStatement, statementToCsv, type StatementContract, type StatementData } from "./statement";

const EGP = 100;
const TODAY = "2026-12-15";

/**
 * A tiny in-memory book that applies money the way the services do
 * (oldest-first allocation, reversing entries, settlement quote), so the
 * statement is tested against realistic rows.
 */
function book() {
  const data: StatementData = { contracts: [], installments: [], payments: [], settlements: [] };
  let clock = Date.UTC(2026, 0, 1);
  let paymentNo = 1000;
  const tick = () => new Date((clock += 60_000));
  const contract = (id: string) => data.contracts.find((c) => c.id === id)!;
  const rowsOf = (id: string) => data.installments.filter((i) => i.contractId === id);

  return {
    data,
    sell(id: string, o: { on: string; cost: number; down: number; fees?: number; months: number; firstDue: string; product?: string }) {
      const schedule = buildFlatSchedule({ principal: o.cost - o.down, annualRateBp: 2000, termMonths: o.months, fees: o.fees ?? 0, firstDueDate: o.firstDue });
      const c: StatementContract = {
        id,
        code: `CT-${id}`,
        productDescription: o.product ?? `منتج ${id}`,
        status: "active",
        downPayment: o.down,
        fees: o.fees ?? 0,
        totalInstallments: schedule.total,
        installmentCount: o.months,
        firstDueDate: o.firstDue,
        confirmedOn: o.on,
        confirmedAt: tick(),
      };
      data.contracts.push(c);
      for (const r of schedule.rows) {
        data.installments.push({ id: `${id}-${r.seq}`, contractId: id, seq: r.seq, dueDate: r.dueDate, amount: r.amount, paidAmount: 0, waivedAmount: 0 });
      }
      return { ...c, schedule };
    },
    pay(id: string, on: string, amount: number) {
      const allocations = allocatePayment(rowsOf(id), amount).map(({ installmentId, amount }) => ({ installmentId, amount }));
      for (const a of allocations) data.installments.find((i) => i.id === a.installmentId)!.paidAmount += a.amount;
      const payment = { id: `p${++paymentNo}`, code: `PAY-${paymentNo}`, contractId: id, kind: "payment" as const, amount, method: "cash" as const, reference: null, paidOn: on, note: null, reversesId: null, createdAt: tick(), allocations };
      data.payments.push(payment);
      if (rowsOf(id).every((i) => i.paidAmount === i.amount)) contract(id).status = "completed";
      return payment;
    },
    reverse(paymentId: string, on: string) {
      const p = data.payments.find((x) => x.id === paymentId)!;
      for (const a of p.allocations) data.installments.find((i) => i.id === a.installmentId)!.paidAmount -= a.amount;
      data.payments.push({ ...p, id: `p${++paymentNo}`, code: `PAY-${paymentNo}`, kind: "reversal", paidOn: on, note: "شيك مرتجع", reversesId: p.id, createdAt: tick(), allocations: [] });
      contract(p.contractId).status = "active";
    },
    settle(id: string, on: string, schedule: ReturnType<typeof buildFlatSchedule>) {
      const quote = quoteSettlement(
        schedule.rows.map((r) => ({ ...r, paidAmount: data.installments.find((i) => i.id === `${id}-${r.seq}`)!.paidAmount })),
        on,
      );
      for (const a of quote.allocations) {
        const i = data.installments.find((x) => x.id === `${id}-${a.seq}`)!;
        i.paidAmount += a.pay;
        i.waivedAmount = a.waive;
      }
      data.settlements.push({ contractId: id, amount: quote.amount, waivedProfit: quote.futureProfit, paymentMethod: "bank_transfer", paymentReference: "TRX-1", settledOn: on, createdAt: tick() });
      contract(id).status = "settled";
      return quote;
    },
  };
}

/** Phone: 12,000 cost, 2,000 down, 12 months from 01 Aug; 10,000 financed at 20% → 12,000 in installments, 1,000 a month. */
function phone(b: ReturnType<typeof book>) {
  return b.sell("A", { on: "2026-07-10", cost: 12_000 * EGP, down: 2_000 * EGP, months: 12, firstDue: "2026-08-01" });
}

/** The invariant behind every statement: balances follow from the entries and nothing else. */
function expectConsistent(s: ReturnType<typeof buildStatement>) {
  let balance = s.period.opening;
  for (const e of s.entries) {
    balance += e.debit - e.credit;
    expect(e.balance).toBe(balance);
  }
  expect(s.period.closing).toBe(s.period.opening + s.period.debits - s.period.credits);
  expect(s.reconciled).toBe(true);
  expect(s.currentBalance).toBe(s.summary.outstanding);
  expect(s.summary.totalPaid).toBe(s.summary.deposits + s.summary.installmentPayments);
  expect(s.summary.sellingPrice - s.summary.totalPaid - s.summary.discounts).toBe(s.summary.outstanding);
}

describe("buildStatement", () => {
  it("returns an empty statement for a customer with no transactions", () => {
    const s = buildStatement({ contracts: [], installments: [], payments: [], settlements: [] }, { today: TODAY });
    expect(s.entries).toEqual([]);
    expect(s.plans).toEqual([]);
    expect(s.period).toMatchObject({ opening: 0, debits: 0, credits: 0, closing: 0 });
    expect(s.summary).toMatchObject({ sellingPrice: 0, totalPaid: 0, outstanding: 0, activePlans: 0, overdueInstallments: 0 });
    expect(s.reconciled).toBe(true);
  });

  it("books the sale as a debit and never as cash received", () => {
    const b = book();
    const c = phone(b);
    const s = buildStatement(b.data, { today: "2026-07-20" });
    expect(c.schedule.total).toBe(12_000 * EGP);
    expect(s.entries.map((e) => [e.type, e.debit, e.credit, e.balance])).toEqual([
      ["sale", 14_000 * EGP, 0, 14_000 * EGP],
      ["down_payment", 0, 2_000 * EGP, 12_000 * EGP],
    ]);
    // Twelve scheduled installments, none paid: only the down payment was received.
    expect(s.summary).toMatchObject({ deposits: 2_000 * EGP, installmentPayments: 0, totalPaid: 2_000 * EGP, outstanding: 12_000 * EGP });
    expect(s.plans[0]).toMatchObject({ paidCount: 0, unpaidCount: 12, overdueCount: 0, nextDueDate: "2026-08-01" });
    expectConsistent(s);
  });

  it("counts the down payment once", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    const s = buildStatement(b.data, { today: TODAY });
    expect(s.entries.filter((e) => e.type === "down_payment")).toHaveLength(1);
    expect(s.summary.totalPaid).toBe(3_000 * EGP);
    expect(s.plans[0].totalPaid).toBe(3_000 * EGP);
    expect(s.shown.credits).toBe(3_000 * EGP);
    expectConsistent(s);
  });

  it("keeps a running balance across payments, including a partial one", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    b.pay("A", "2026-09-03", 400 * EGP);
    const s = buildStatement(b.data, { today: "2026-09-10" });
    expect(s.entries.map((e) => e.balance)).toEqual([14_000 * EGP, 12_000 * EGP, 11_000 * EGP, 10_600 * EGP]);
    expect(s.entries.at(-1)).toMatchObject({ type: "payment", description: "سداد جزئي للقسط 2", credit: 400 * EGP });
    const second = s.plans[0].installments[1];
    expect(second).toMatchObject({ paid: 400 * EGP, remaining: 600 * EGP, status: "partial", late: true, paidOn: "2026-09-03" });
    expect(s.summary).toMatchObject({ overdueInstallments: 1, overdueAmount: 600 * EGP });
    expectConsistent(s);
  });

  it("separates the plans of a customer with several contracts", () => {
    const b = book();
    phone(b);
    b.sell("B", { on: "2026-09-05", cost: 6_000 * EGP, down: 0, fees: 150 * EGP, months: 6, firstDue: "2026-10-05", product: "غسالة" });
    b.pay("A", "2026-08-01", 1_000 * EGP);
    b.pay("B", "2026-10-05", 500 * EGP);
    const all = buildStatement(b.data, { today: "2026-10-06" });
    expect(all.plans.map((p) => p.code)).toEqual(["CT-B", "CT-A"]);
    expect(all.summary.activePlans).toBe(2);
    expect(all.summary.fees).toBe(150 * EGP);
    expect(all.entries.find((e) => e.type === "fee")).toMatchObject({ debit: 150 * EGP, contractCode: "CT-B" });
    expect(all.summary.outstanding).toBe(all.plans[0].remaining + all.plans[1].remaining);
    expectConsistent(all);

    const onlyB = buildStatement(b.data, { today: "2026-10-06", contractId: "B" });
    expect(onlyB.entries.every((e) => e.contractCode === "CT-B")).toBe(true);
    expect(onlyB.currentBalance).toBe(all.plans[0].remaining);
    expect(onlyB.contracts).toHaveLength(2);
    expectConsistent(onlyB);
  });

  it("closes a fully paid plan with a zero balance", () => {
    const b = book();
    const c = b.sell("A", { on: "2026-07-10", cost: 3_000 * EGP, down: 500 * EGP, months: 3, firstDue: "2026-08-01" });
    for (const r of c.schedule.rows) b.pay("A", r.dueDate, r.amount);
    const s = buildStatement(b.data, { today: TODAY });
    expect(s.currentBalance).toBe(0);
    expect(s.summary).toMatchObject({ outstanding: 0, activePlans: 0, completedPlans: 1, overdueInstallments: 0 });
    expect(s.summary.totalPaid).toBe(s.summary.sellingPrice);
    expect(s.plans[0]).toMatchObject({ status: "completed", paidCount: 3, unpaidCount: 0, nextDueDate: null, remaining: 0 });
    expectConsistent(s);
  });

  it("flags overdue installments and leaves future ones alone", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    const s = buildStatement(b.data, { today: "2026-11-15" });
    // Due 01 Sep, 01 Oct, 01 Nov are late; 01 Dec onwards are not.
    expect(s.summary).toMatchObject({ overdueInstallments: 3, overdueAmount: 3_000 * EGP });
    expect(s.plans[0]).toMatchObject({ status: "overdue", overdueCount: 3, nextDueDate: "2026-09-01" });
    expect(s.plans[0].installments.filter((i) => i.late).map((i) => i.seq)).toEqual([2, 3, 4]);
    const late = buildStatement(b.data, { today: "2026-11-15", installments: "overdue" });
    expect(late.plans[0].installments.map((i) => i.seq)).toEqual([2, 3, 4]);
    expect(late.plans[0].unpaidCount).toBe(11);
  });

  it("undoes a reversed payment without erasing it", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    const bounced = b.pay("A", "2026-09-01", 1_000 * EGP);
    b.reverse(bounced.id, "2026-09-04");
    const s = buildStatement(b.data, { today: "2026-09-10" });
    expect(s.entries.slice(-2).map((e) => [e.type, e.status, e.debit, e.credit, e.balance])).toEqual([
      ["payment", "reversed", 0, 1_000 * EGP, 10_000 * EGP],
      ["reversal", "posted", 1_000 * EGP, 0, 11_000 * EGP],
    ]);
    expect(s.entries.at(-1)!.description).toContain(bounced.code);
    // The reversed payment can't be reversed again; the live one still can.
    expect(s.entries.filter((e) => e.paymentId).map((e) => e.ref)).toEqual(["PAY-1001"]);
    expect(s.summary).toMatchObject({ installmentPayments: 1_000 * EGP, outstanding: 11_000 * EGP });
    expect(s.plans[0].installments[1]).toMatchObject({ paid: 0, paidOn: null, status: "overdue" });
    expectConsistent(s);
  });

  it("reopens a plan when the payment that completed it is reversed", () => {
    const b = book();
    const c = b.sell("A", { on: "2026-07-10", cost: 2_000 * EGP, down: 0, months: 2, firstDue: "2026-08-01" });
    b.pay("A", "2026-08-01", c.schedule.rows[0].amount);
    const last = b.pay("A", "2026-09-01", c.schedule.rows[1].amount);
    expect(buildStatement(b.data, { today: TODAY }).summary.completedPlans).toBe(1);
    b.reverse(last.id, "2026-09-02");
    const s = buildStatement(b.data, { today: TODAY });
    expect(s.summary).toMatchObject({ completedPlans: 0, activePlans: 1, outstanding: c.schedule.rows[1].amount });
    expectConsistent(s);
  });

  it("shows an early settlement as money received plus a discount", () => {
    const b = book();
    const c = phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    const quote = b.settle("A", "2026-09-15", c.schedule);
    const s = buildStatement(b.data, { today: TODAY });
    expect(quote.futureProfit).toBeGreaterThan(0);
    expect(s.entries.slice(-2).map((e) => [e.type, e.credit])).toEqual([
      ["settlement", quote.amount],
      ["discount", quote.futureProfit],
    ]);
    expect(s.currentBalance).toBe(0);
    // Forgiven profit is a discount, not a payment.
    expect(s.summary).toMatchObject({ installmentPayments: 1_000 * EGP + quote.amount, discounts: quote.futureProfit, completedPlans: 1 });
    expect(s.summary.totalPaid).toBe(s.summary.sellingPrice - quote.futureProfit);
    expect(s.entries.some((e) => e.paymentId)).toBe(false);
    expect(s.plans[0].installments.at(-1)).toMatchObject({ status: "waived", paidOn: "2026-09-15", remaining: 0 });
    expectConsistent(s);
  });

  it("carries the opening balance into a custom date range", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    b.pay("A", "2026-09-01", 1_000 * EGP);
    b.pay("A", "2026-10-02", 1_000 * EGP);
    b.pay("A", "2026-11-01", 1_000 * EGP);
    const s = buildStatement(b.data, { today: TODAY, from: "2026-09-01", to: "2026-10-31" });
    expect(s.period).toEqual({ from: "2026-09-01", to: "2026-10-31", opening: 11_000 * EGP, debits: 0, credits: 2_000 * EGP, closing: 9_000 * EGP });
    expect(s.entries.map((e) => [e.date, e.balance])).toEqual([
      ["2026-09-01", 10_000 * EGP],
      ["2026-10-02", 9_000 * EGP],
    ]);
    // The overall balance and summary ignore the period.
    expect(s.currentBalance).toBe(8_000 * EGP);
    expect(s.summary.installmentPayments).toBe(4_000 * EGP);
    expectConsistent(s);
  });

  it("chains consecutive periods: each opens where the previous closed", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    b.pay("A", "2026-09-01", 700 * EGP);
    b.pay("A", "2026-10-02", 1_300 * EGP);
    const months = [
      ["2026-07-01", "2026-07-31"],
      ["2026-08-01", "2026-08-31"],
      ["2026-09-01", "2026-09-30"],
      ["2026-10-01", "2026-10-31"],
    ].map(([from, to]) => buildStatement(b.data, { today: TODAY, from, to }).period);
    expect(months[0].opening).toBe(0);
    for (let i = 1; i < months.length; i++) expect(months[i].opening).toBe(months[i - 1].closing);
    expect(months.at(-1)!.closing).toBe(buildStatement(b.data, { today: TODAY }).currentBalance);
    // A period before any activity, and an open-ended one.
    expect(buildStatement(b.data, { today: TODAY, from: "2026-01-01", to: "2026-06-30" }).period).toMatchObject({ opening: 0, closing: 0 });
    expect(buildStatement(b.data, { today: TODAY, to: "2026-08-31" }).period).toMatchObject({ opening: 0, closing: 11_000 * EGP });
  });

  it("filters by type without bending the balances", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    b.pay("A", "2026-09-01", 1_000 * EGP);
    const s = buildStatement(b.data, { today: TODAY, type: "payment" });
    expect(s.entries.map((e) => e.type)).toEqual(["payment", "payment"]);
    expect(s.entries.map((e) => e.balance)).toEqual([11_000 * EGP, 10_000 * EGP]);
    expect(s.shown).toEqual({ debits: 0, credits: 2_000 * EGP });
    expect(s.period).toMatchObject({ debits: 14_000 * EGP, credits: 4_000 * EGP, closing: 10_000 * EGP });
  });

  it("orders same-day entries by when they were recorded", () => {
    const b = book();
    b.sell("A", { on: "2026-07-10", cost: 2_000 * EGP, down: 500 * EGP, fees: 50 * EGP, months: 2, firstDue: "2026-08-01" });
    b.pay("A", "2026-07-10", 100 * EGP);
    const s = buildStatement(b.data, { today: TODAY });
    expect(s.entries.map((e) => e.type)).toEqual(["sale", "fee", "down_payment", "payment"]);
    expect(s.entries[0].debit + s.entries[1].debit).toBe(s.summary.sellingPrice);
  });

  it("reports a ledger that disagrees with the installments instead of hiding it", () => {
    const b = book();
    phone(b);
    b.pay("A", "2026-08-01", 1_000 * EGP);
    // Paid amount changed behind the ledger's back (e.g. a payment recorded twice on the installment).
    b.data.installments[1].paidAmount = 1_000 * EGP;
    expect(buildStatement(b.data, { today: TODAY }).reconciled).toBe(false);
  });
});

describe("statementToCsv", () => {
  it("exports the period with opening, totals and closing rows", () => {
    const b = book();
    b.sell("A", { on: "2026-07-10", cost: 12_000 * EGP, down: 2_000 * EGP, months: 12, firstDue: "2026-08-01", product: 'هاتف "برو", 256' });
    b.pay("A", "2026-08-01", 1_000 * EGP);
    b.pay("A", "2026-09-01", 1_000 * EGP);
    const csv = statementToCsv(buildStatement(b.data, { today: TODAY, from: "2026-08-01", to: "2026-09-30" }));
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(7);
    expect(lines[0].split(",")).toHaveLength(12);
    expect(lines[1]).toBe("2026-08-01,,,رصيد أول المدة,,,,,12000.00,,,");
    expect(lines[2]).toBe('2026-08-01,PAY-1001,سداد قسط,سداد القسط 1,CT-A,"هاتف ""برو"", 256",,1000.00,11000.00,نقدي,,مُرحّلة');
    expect(lines[4]).toBe(",,,الإجمالي,,,0.00,2000.00,,,,");
    expect(lines[5]).toBe("2026-09-30,,,رصيد آخر المدة,,,,,10000.00,,,");
    expect(lines[6]).toBe("2026-12-15,,,الرصيد الحالي المستحق,,,,,10000.00,,,");
  });

  it("exports an empty statement as headers and zero balances", () => {
    const csv = statementToCsv(buildStatement({ contracts: [], installments: [], payments: [], settlements: [] }, { today: TODAY }));
    expect(csv.slice(1).trimEnd().split("\r\n")).toHaveLength(5);
    expect(csv).toContain("رصيد آخر المدة,,,,,0.00");
  });
});

describe("customer-facing content", () => {
  it("never carries the shop's purchase cost", () => {
    const b = book();
    // Cost 7,777.77 appears nowhere else: not as a total, a balance or an installment.
    b.sell("A", { on: "2026-07-10", cost: 777_777, down: 100_000, months: 3, firstDue: "2026-08-01" });
    const s = buildStatement(b.data, { today: TODAY });
    expect(JSON.stringify(s)).not.toContain("777777");
    expect(JSON.stringify(s)).not.toMatch(/originalPrice|purchaseCost/);
    expect(statementToCsv(s)).not.toContain("7777.77");
  });
});
