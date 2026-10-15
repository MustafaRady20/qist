/**
 * Customer account statement, built from the records that already hold the
 * money: contracts (sale, fees, down payment), payments and their reversals,
 * and early settlements. Pure: no database, integer piastres, ISO dates.
 *
 * Convention: a debit is an amount the customer owes (the sale, its fees, a
 * reversed payment); a credit is an amount that reduces what they owe (down
 * payment, payments, settlement, forgiven profit). The running balance is
 * debits − credits, i.e. what is still owed after each entry.
 *
 * Every amount is counted from one record only: the down payment from the
 * contract, installment money from payments, settlement money from the
 * settlement. Scheduled installments are never treated as received.
 */
import { paymentMethodLabels } from "@/lib/payments";
import { entryStatusLabels, entryTypeLabels } from "@/lib/statement";
import type { ContractStatus, PaymentKind, PaymentMethod } from "@/server/db/schema";
import { installmentStatus, type InstallmentStatus } from "./installments";

export const statementEntryTypes = ["sale", "fee", "down_payment", "payment", "reversal", "settlement", "discount"] as const;
export type StatementEntryType = (typeof statementEntryTypes)[number];

export const statementInstallmentFilters = ["paid", "partial", "unpaid", "overdue"] as const;
export type StatementInstallmentFilter = (typeof statementInstallmentFilters)[number];

// ── Input: rows as stored ───────────────────────────────────────────────────

export type StatementContract = {
  id: string;
  code: string;
  productDescription: string;
  /** Confirmed contracts only: drafts and cancelled drafts have no financial effect. */
  status: Exclude<ContractStatus, "draft" | "cancelled">;
  downPayment: number;
  fees: number;
  totalInstallments: number;
  installmentCount: number;
  firstDueDate: string;
  /** Cairo date the contract was confirmed: the sale and the down payment are dated on it. */
  confirmedOn: string;
  confirmedAt: Date;
};

export type StatementInstallment = {
  id: string;
  contractId: string;
  seq: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  waivedAmount: number;
};

export type StatementPayment = {
  id: string;
  code: string;
  contractId: string;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidOn: string;
  note: string | null;
  reversesId: string | null;
  createdAt: Date;
  allocations: { installmentId: string; amount: number }[];
};

export type StatementSettlement = {
  contractId: string;
  amount: number;
  waivedProfit: number;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  settledOn: string;
  createdAt: Date;
};

export type StatementData = {
  contracts: StatementContract[];
  installments: StatementInstallment[];
  payments: StatementPayment[];
  settlements: StatementSettlement[];
};

export type StatementOptions = {
  today: string;
  /** Inclusive period; leave both out for the whole history. */
  from?: string;
  to?: string;
  /** Show only entries of this type. Balances still follow the whole ledger. */
  type?: StatementEntryType;
  /** Limit the statement to one contract (balances are then that contract's). */
  contractId?: string;
  /** Show only installments in this state in the plan details. */
  installments?: StatementInstallmentFilter;
};

// ── Output ──────────────────────────────────────────────────────────────────

export type StatementEntry = {
  id: string;
  date: string;
  ref: string;
  type: StatementEntryType;
  description: string;
  contractId: string;
  contractCode: string;
  product: string;
  debit: number;
  credit: number;
  /** What the customer owes after this entry. */
  balance: number;
  method: PaymentMethod | null;
  reference: string | null;
  status: keyof typeof entryStatusLabels;
  /** Set on payments that can still be reversed. */
  paymentId?: string;
};

export type StatementInstallmentRow = {
  id: string;
  seq: number;
  dueDate: string;
  amount: number;
  paid: number;
  waived: number;
  remaining: number;
  /** Date of the last money applied to it; null when nothing was received. */
  paidOn: string | null;
  status: InstallmentStatus;
  /** Past its due date with something still owed (also true for late partial payments). */
  late: boolean;
};

export type StatementPlan = {
  contractId: string;
  code: string;
  product: string;
  status: StatementContract["status"] | "overdue";
  sellingPrice: number;
  deposit: number;
  fees: number;
  /** Selling price: down payment + all installments. */
  totalDue: number;
  /** Down payment + money received on installments (settlement included). */
  totalPaid: number;
  /** Profit forgiven by an early settlement. */
  discount: number;
  remaining: number;
  installmentCount: number;
  firstDueDate: string;
  nextDueDate: string | null;
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
  /** The schedule, after the installment filter. */
  installments: StatementInstallmentRow[];
};

/** What the shop paid for the goods is internal and is deliberately not part of the statement. */
export type StatementSummary = {
  sellingPrice: number;
  deposits: number;
  /** Money received on installments: payments net of reversals, plus settlement amounts. */
  installmentPayments: number;
  fees: number;
  /** Profit forgiven by early settlements (not money received). */
  discounts: number;
  totalPaid: number;
  outstanding: number;
  overdueAmount: number;
  activePlans: number;
  completedPlans: number;
  overdueInstallments: number;
};

export type Statement = {
  asOf: string;
  period: {
    from: string | null;
    to: string | null;
    opening: number;
    /** All entries of the period, whatever the type filter. */
    debits: number;
    credits: number;
    closing: number;
  };
  /** Entries of the period after the type filter, oldest first. */
  entries: StatementEntry[];
  /** Totals of `entries` (differ from the period totals only under a type filter). */
  shown: { debits: number; credits: number };
  /** What is owed today, whatever the period. */
  currentBalance: number;
  summary: StatementSummary;
  plans: StatementPlan[];
  /** Every contract of the customer, for the plan filter. */
  contracts: { id: string; code: string; product: string }[];
  /** False when the ledger disagrees with the installment balances; the page then warns. */
  reconciled: boolean;
};

type RawEntry = Omit<StatementEntry, "balance"> & { at: number; rank: number };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function paymentDescription(seqs: number[], partial: boolean): string {
  if (!seqs.length) return "دفعة على العقد";
  if (seqs.length === 1) return partial ? `سداد جزئي للقسط ${seqs[0]}` : `سداد القسط ${seqs[0]}`;
  return `سداد الأقساط ${seqs[0]}–${seqs.at(-1)}`;
}

export function buildStatement(data: StatementData, options: StatementOptions): Statement {
  const { today } = options;
  const contracts = data.contracts.filter((c) => !options.contractId || c.id === options.contractId);
  const ids = new Set(contracts.map((c) => c.id));
  const installments = data.installments.filter((i) => ids.has(i.contractId));
  const payments = data.payments.filter((p) => ids.has(p.contractId));
  const settlements = data.settlements.filter((s) => ids.has(s.contractId));

  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const installmentById = new Map(installments.map((i) => [i.id, i]));
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const reversed = new Set(payments.filter((p) => p.kind === "reversal").map((p) => p.reversesId!));
  const settlementOf = new Map(settlements.map((s) => [s.contractId, s]));

  // ── Ledger ──
  const raw: RawEntry[] = [];
  for (const c of contracts) {
    const base = { contractId: c.id, contractCode: c.code, product: c.productDescription, method: null, reference: null, status: "posted" as const };
    const at = c.confirmedAt.getTime();
    raw.push({
      ...base,
      id: `${c.id}:sale`,
      date: c.confirmedOn,
      ref: c.code,
      type: "sale",
      description: `بيع بالتقسيط: ${c.productDescription}`,
      debit: c.downPayment + c.totalInstallments - c.fees,
      credit: 0,
      at,
      rank: 0,
    });
    if (c.fees > 0) {
      raw.push({ ...base, id: `${c.id}:fee`, date: c.confirmedOn, ref: `${c.code}-F`, type: "fee", description: "رسوم العقد", debit: c.fees, credit: 0, at, rank: 1 });
    }
    if (c.downPayment > 0) {
      raw.push({ ...base, id: `${c.id}:down`, date: c.confirmedOn, ref: `${c.code}-DP`, type: "down_payment", description: "دفع المقدم", debit: 0, credit: c.downPayment, at, rank: 2 });
    }
  }
  for (const p of payments) {
    const c = contractById.get(p.contractId)!;
    const base = { contractId: c.id, contractCode: c.code, product: c.productDescription, method: p.method, reference: p.reference, at: p.createdAt.getTime() };
    if (p.kind === "reversal") {
      const original = paymentById.get(p.reversesId!);
      raw.push({
        ...base,
        id: p.id,
        date: p.paidOn,
        ref: p.code,
        type: "reversal",
        description: `عكس الدفعة ${original?.code ?? ""}${p.note ? ` • ${p.note}` : ""}`.trim(),
        debit: p.amount,
        credit: 0,
        status: "posted",
        rank: 4,
      });
      continue;
    }
    const seqs = p.allocations.map((a) => installmentById.get(a.installmentId)?.seq).filter((s): s is number => s !== undefined).sort((a, b) => a - b);
    const only = p.allocations.length === 1 ? installmentById.get(p.allocations[0].installmentId) : undefined;
    const isReversed = reversed.has(p.id);
    raw.push({
      ...base,
      id: p.id,
      date: p.paidOn,
      ref: p.code,
      type: "payment",
      description: p.note && !seqs.length ? p.note : paymentDescription(seqs, !!only && p.amount < only.amount),
      debit: 0,
      credit: p.amount,
      status: isReversed ? "reversed" : "posted",
      rank: 3,
      // A settlement consumes what was paid before it, so those payments can no longer be undone.
      paymentId: !isReversed && (c.status === "active" || c.status === "completed") ? p.id : undefined,
    });
  }
  for (const s of settlements) {
    const c = contractById.get(s.contractId)!;
    const base = { contractId: c.id, contractCode: c.code, product: c.productDescription, date: s.settledOn, status: "posted" as const, at: s.createdAt.getTime() };
    raw.push({ ...base, id: `${c.id}:settlement`, ref: `${c.code}-ST`, type: "settlement", description: "سداد مبلغ التسوية المبكرة", debit: 0, credit: s.amount, method: s.paymentMethod, reference: s.paymentReference, rank: 5 });
    if (s.waivedProfit > 0) {
      raw.push({ ...base, id: `${c.id}:discount`, ref: `${c.code}-WV`, type: "discount", description: "إعفاء العائد المستقبلي بالتسوية المبكرة", debit: 0, credit: s.waivedProfit, method: null, reference: null, rank: 6 });
    }
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at || a.rank - b.rank || a.ref.localeCompare(b.ref));

  let balance = 0;
  const ledger: StatementEntry[] = raw.map((entry) => {
    const { at, rank, ...e } = entry;
    void at;
    void rank;
    balance += e.debit - e.credit;
    return { ...e, balance };
  });
  const currentBalance = balance;

  // ── Period ──
  const from = options.from ?? null;
  const to = options.to ?? null;
  const before = from ? ledger.filter((e) => e.date < from) : [];
  const inPeriod = ledger.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  const opening = before.at(-1)?.balance ?? 0;
  const debits = sum(inPeriod.map((e) => e.debit));
  const credits = sum(inPeriod.map((e) => e.credit));
  const entries = options.type ? inPeriod.filter((e) => e.type === options.type) : inPeriod;

  // ── Plans ──
  const livePayments = payments.filter((p) => p.kind === "payment" && !reversed.has(p.id));
  const lastPaid = new Map<string, { date: string; amount: number }>();
  for (const p of livePayments) {
    for (const a of p.allocations) {
      const seen = lastPaid.get(a.installmentId);
      lastPaid.set(a.installmentId, { date: seen && seen.date > p.paidOn ? seen.date : p.paidOn, amount: (seen?.amount ?? 0) + a.amount });
    }
  }

  const plans: StatementPlan[] = contracts
    .map((c) => {
      const settlement = settlementOf.get(c.id);
      const rows: StatementInstallmentRow[] = installments
        .filter((i) => i.contractId === c.id)
        .sort((a, b) => a.seq - b.seq)
        .map((i) => {
          const remaining = i.amount - i.paidAmount - i.waivedAmount;
          const applied = lastPaid.get(i.id);
          // Money beyond the recorded payments came in with the settlement.
          const bySettlement = settlement && i.paidAmount > (applied?.amount ?? 0) ? settlement.settledOn : null;
          return {
            id: i.id,
            seq: i.seq,
            dueDate: i.dueDate,
            amount: i.amount,
            paid: i.paidAmount,
            waived: i.waivedAmount,
            remaining,
            paidOn: i.paidAmount > 0 ? (bySettlement ?? applied?.date ?? null) : null,
            status: installmentStatus(i, today),
            late: c.status === "active" && remaining > 0 && i.dueDate < today,
          };
        });
      const overdueCount = rows.filter((r) => r.late).length;
      const paid = sum(rows.map((r) => r.paid));
      const shown = rows.filter((r) => {
        switch (options.installments) {
          case "paid":
            return r.remaining === 0;
          case "partial":
            return r.paid > 0 && r.remaining > 0;
          case "unpaid":
            return r.remaining > 0;
          case "overdue":
            return r.late;
          default:
            return true;
        }
      });
      return {
        contractId: c.id,
        code: c.code,
        product: c.productDescription,
        status: c.status === "active" && overdueCount > 0 ? ("overdue" as const) : c.status,
        sellingPrice: c.downPayment + c.totalInstallments,
        deposit: c.downPayment,
        fees: c.fees,
        totalDue: c.downPayment + c.totalInstallments,
        totalPaid: c.downPayment + paid,
        discount: sum(rows.map((r) => r.waived)),
        remaining: sum(rows.map((r) => r.remaining)),
        installmentCount: c.installmentCount,
        firstDueDate: c.firstDueDate,
        nextDueDate: c.status === "active" ? (rows.find((r) => r.remaining > 0)?.dueDate ?? null) : null,
        paidCount: rows.filter((r) => r.remaining === 0).length,
        unpaidCount: rows.filter((r) => r.remaining > 0).length,
        overdueCount,
        installments: shown,
        confirmedAt: c.confirmedAt.getTime(),
      };
    })
    .sort((a, b) => b.confirmedAt - a.confirmedAt || b.code.localeCompare(a.code))
    .map(({ confirmedAt, ...plan }) => {
      void confirmedAt;
      return plan;
    });

  // ── Summary: each figure from one source ──
  const netPayments = sum(payments.map((p) => (p.kind === "reversal" ? -p.amount : p.amount)));
  const installmentPayments = netPayments + sum(settlements.map((s) => s.amount));
  const deposits = sum(contracts.map((c) => c.downPayment));
  const outstanding = sum(installments.map((i) => i.amount - i.paidAmount - i.waivedAmount));
  const late = installments.filter((i) => contractById.get(i.contractId)!.status === "active" && i.dueDate < today && i.amount - i.paidAmount - i.waivedAmount > 0);

  return {
    asOf: today,
    period: { from, to, opening, debits, credits, closing: opening + debits - credits },
    entries,
    shown: { debits: sum(entries.map((e) => e.debit)), credits: sum(entries.map((e) => e.credit)) },
    currentBalance,
    summary: {
      sellingPrice: sum(contracts.map((c) => c.downPayment + c.totalInstallments)),
      deposits,
      installmentPayments,
      fees: sum(contracts.map((c) => c.fees)),
      discounts: sum(installments.map((i) => i.waivedAmount)),
      totalPaid: deposits + installmentPayments,
      outstanding,
      overdueAmount: sum(late.map((i) => i.amount - i.paidAmount - i.waivedAmount)),
      activePlans: contracts.filter((c) => c.status === "active").length,
      completedPlans: contracts.filter((c) => c.status === "completed" || c.status === "settled").length,
      overdueInstallments: late.length,
    },
    plans,
    contracts: data.contracts.map((c) => ({ id: c.id, code: c.code, product: c.productDescription })),
    reconciled: currentBalance === outstanding && installmentPayments === sum(installments.map((i) => i.paidAmount)),
  };
}

// ── CSV export ──────────────────────────────────────────────────────────────

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return (value / 100).toFixed(2);
  // Neutralize spreadsheet formulas, then quote.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The period's transactions as CSV (UTF-8 with BOM so Excel reads the Arabic),
 * amounts in pounds, framed by the opening and closing balance rows.
 */
export function statementToCsv(statement: Statement): string {
  const { period } = statement;
  const header = ["التاريخ", "المرجع", "النوع", "البيان", "العقد", "المنتج", "مدين", "دائن", "الرصيد", "وسيلة الدفع", "مرجع الدفع", "الحالة"];
  const blank = (label: string, date: string | null, amount: number) => [date ?? "", "", "", label, "", "", null, null, amount, "", "", ""];
  const rows: (string | number | null)[][] = [
    header,
    blank("رصيد أول المدة", period.from, period.opening),
    ...statement.entries.map((e) => [
      e.date,
      e.ref,
      entryTypeLabels[e.type],
      e.description,
      e.contractCode,
      e.product,
      e.debit || null,
      e.credit || null,
      e.balance,
      e.method ? paymentMethodLabels[e.method] : "",
      e.reference ?? "",
      entryStatusLabels[e.status],
    ]),
    ["", "", "", "الإجمالي", "", "", statement.shown.debits, statement.shown.credits, null, "", "", ""],
    blank("رصيد آخر المدة", period.to ?? statement.asOf, period.closing),
    blank("الرصيد الحالي المستحق", statement.asOf, statement.currentBalance),
  ];
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
