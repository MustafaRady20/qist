import "server-only";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { installmentStatus, type InstallmentStatus } from "@/server/contracts/service";
import { db } from "@/server/db";
import type { PaymentMethod } from "@/server/db/schema";
import { daysBetween, resolveRange, type DateRange } from "@/server/finance/period";
import { todayInCairo } from "@/server/time";

export const dashboardPeriods = ["month", "today", "week", "custom"] as const;
export type DashboardPeriod = (typeof dashboardPeriods)[number];

export type AgingBand = { key: "1-7" | "8-30" | "31-60" | "61-90" | "90+"; amount: number };
export type MonthlyCollection = { month: number; expected: number; actual: number };

export type DueInstallment = {
  id: string;
  customerName: string;
  customerCode: string;
  contractCode: string;
  seq: number;
  amount: number;
  remaining: number;
  status: InstallmentStatus;
};

export type FollowUp = {
  customerCode: string;
  customerName: string;
  overdue: number;
  installments: number;
  daysLate: number;
  /** Part of the oldest late installment was paid. */
  partial: boolean;
};

export type RecentReceipt = {
  id: string;
  customerName: string;
  contractCode: string;
  amount: number;
  method: PaymentMethod;
  date: string;
};

export type Dashboard = {
  asOf: string;
  range: DateRange;
  kpis: {
    /** Total installment value of active contracts. */
    portfolio: number;
    activeContracts: number;
    /** Still owed on active contracts. */
    outstanding: number;
    overdue: number;
    overdueCustomers: number;
    /** Installments falling due in the period, and how much of them is paid. */
    periodDue: number;
    periodCollected: number;
  };
  aging: AgingBand[];
  collections: { year: number; months: MonthlyCollection[] };
  dueToday: DueInstallment[];
  followUps: FollowUp[];
  recentReceipts: RecentReceipt[];
};

const remaining = sql`(i.amount - i.paid_amount - i.waived_amount)`;
const LIST_LIMIT = 10;

/**
 * Dashboard figures (Figma "dashboard"), all derived from contracts and their
 * installments. Collection is measured against due dates: "collected" is what
 * has been paid on the installments that fall due in the period.
 */
export async function getDashboard(params: { period?: DashboardPeriod; from?: unknown; to?: unknown } = {}): Promise<Dashboard> {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const range = resolveRange(params.period ?? "month", today, params);
  const year = Number(today.slice(0, 4));

  const [[totals], [contractTotals], agingRows, monthRows, dueRows, followUpRows, receiptRows] = await Promise.all([
    db.execute<Record<string, string>>(sql`
      select
        coalesce(sum(${remaining}) filter (where c.status = 'active'), 0) as outstanding,
        coalesce(sum(${remaining}) filter (where c.status = 'active' and i.due_date < ${today}), 0) as overdue,
        count(distinct c.customer_id) filter (where c.status = 'active' and i.due_date < ${today} and ${remaining} > 0) as overdue_customers,
        coalesce(sum(i.amount - i.waived_amount) filter (where i.due_date between ${range.from} and ${range.to}), 0) as period_due,
        coalesce(sum(i.paid_amount) filter (where i.due_date between ${range.from} and ${range.to}), 0) as period_collected
      from installments i join contracts c on c.id = i.contract_id`),
    db.execute<Record<string, string>>(sql`
      select count(*) as active_contracts, coalesce(sum(total_installments), 0) as portfolio
      from contracts where status = 'active'`),
    db.execute<{ band: AgingBand["key"]; amount: string }>(sql`
      select case
          when ${today}::date - i.due_date <= 7 then '1-7'
          when ${today}::date - i.due_date <= 30 then '8-30'
          when ${today}::date - i.due_date <= 60 then '31-60'
          when ${today}::date - i.due_date <= 90 then '61-90'
          else '90+' end as band,
        sum(${remaining}) as amount
      from installments i join contracts c on c.id = i.contract_id
      where c.status = 'active' and i.due_date < ${today} and ${remaining} > 0
      group by 1`),
    db.execute<{ month: number; expected: string; actual: string }>(sql`
      select extract(month from i.due_date)::int as month,
        sum(i.amount - i.waived_amount) as expected, sum(i.paid_amount) as actual
      from installments i
      where i.due_date between ${`${year}-01-01`} and ${`${year}-12-31`}
      group by 1`),
    db.execute<{ id: string; seq: number; code: string; customer_name: string; customer_code: string; amount: string; paid_amount: string }>(sql`
      select i.id, i.seq, i.amount, i.paid_amount, c.code, cu.full_name as customer_name, cu.code as customer_code
      from installments i
      join contracts c on c.id = i.contract_id
      join customers cu on cu.id = c.customer_id
      where c.status = 'active' and i.due_date = ${today}
      order by cu.full_name, c.code
      limit ${LIST_LIMIT}`),
    db.execute<{ code: string; full_name: string; overdue: string; installments: string; oldest: string; partial: boolean }>(sql`
      select cu.code, cu.full_name, sum(${remaining}) as overdue, count(*) as installments,
        min(i.due_date) as oldest, bool_or(i.paid_amount > 0) as partial
      from installments i
      join contracts c on c.id = i.contract_id
      join customers cu on cu.id = c.customer_id
      where c.status = 'active' and i.due_date < ${today} and ${remaining} > 0
      group by cu.id
      order by oldest, cu.code
      limit ${LIST_LIMIT}`),
    db.execute<{ id: string; full_name: string; code: string; amount: string; payment_method: PaymentMethod; settled_on: string }>(sql`
      select s.id, s.amount, s.payment_method, s.settled_on, c.code, cu.full_name
      from contract_settlements s
      join contracts c on c.id = s.contract_id
      join customers cu on cu.id = c.customer_id
      order by s.settled_on desc, s.created_at desc
      limit 5`),
  ]);

  const agingByBand = new Map(agingRows.map((r) => [r.band, Number(r.amount)]));
  const byMonth = new Map(monthRows.map((r) => [r.month, r]));

  return {
    asOf: today,
    range,
    kpis: {
      portfolio: Number(contractTotals.portfolio),
      activeContracts: Number(contractTotals.active_contracts),
      outstanding: Number(totals.outstanding),
      overdue: Number(totals.overdue),
      overdueCustomers: Number(totals.overdue_customers),
      periodDue: Number(totals.period_due),
      periodCollected: Number(totals.period_collected),
    },
    aging: (["1-7", "8-30", "31-60", "61-90", "90+"] as const).map((key) => ({ key, amount: agingByBand.get(key) ?? 0 })),
    collections: {
      year,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        expected: Number(byMonth.get(i + 1)?.expected ?? 0),
        actual: Number(byMonth.get(i + 1)?.actual ?? 0),
      })),
    },
    dueToday: dueRows.map((r) => {
      const amount = Number(r.amount);
      const paidAmount = Number(r.paid_amount);
      return {
        id: r.id,
        customerName: r.customer_name,
        customerCode: r.customer_code,
        contractCode: r.code,
        seq: r.seq,
        amount,
        remaining: amount - paidAmount,
        status: installmentStatus({ amount, paidAmount, dueDate: today }, today),
      };
    }),
    followUps: followUpRows.map((r) => ({
      customerCode: r.code,
      customerName: r.full_name,
      overdue: Number(r.overdue),
      installments: Number(r.installments),
      daysLate: daysBetween(r.oldest, today),
      partial: r.partial,
    })),
    recentReceipts: receiptRows.map((r) => ({
      id: r.id,
      customerName: r.full_name,
      contractCode: r.code,
      amount: Number(r.amount),
      method: r.payment_method,
      date: r.settled_on,
    })),
  };
}
