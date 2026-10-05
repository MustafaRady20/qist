import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { installmentStatus, type InstallmentStatus } from "@/server/contracts/service";
import { db } from "@/server/db";
import { addDays, daysBetween } from "@/server/finance/period";
import { todayInCairo } from "@/server/time";
import { PAGE_SIZE } from "@/server/validation";

export const installmentTabs = ["all", "today", "overdue", "upcoming", "partial", "paid"] as const;
export type InstallmentTab = (typeof installmentTabs)[number];

/** How far ahead the "upcoming" summary looks. */
export const UPCOMING_DAYS = 30;

export type InstallmentListItem = {
  id: string;
  seq: number;
  contractCode: string;
  customerName: string;
  customerCode: string;
  productDescription: string;
  dueDate: string;
  amount: number;
  paid: number;
  /** What is still owed on this installment (not the contract balance). */
  remaining: number;
  daysLate: number;
  status: InstallmentStatus;
};

const remaining = sql`(i.amount - i.paid_amount - i.waived_amount)`;
// Only active contracts are still collected; settled ones have their remainder waived.
const open = sql`c.status = 'active' and ${remaining} > 0`;

function tabFilter(tab: InstallmentTab, today: string): SQL {
  switch (tab) {
    case "today":
      return sql`${open} and i.due_date = ${today}`;
    // Includes the late remainder of partially paid installments.
    case "overdue":
      return sql`${open} and i.due_date < ${today}`;
    case "upcoming":
      return sql`${open} and i.due_date > ${today}`;
    case "partial":
      return sql`${open} and i.paid_amount > 0`;
    case "paid":
      return sql`i.paid_amount >= i.amount`;
    default:
      return open;
  }
}

/** One row per installment (Figma "installments"). The default tab lists everything still unpaid. */
export async function listInstallments(params: { tab?: InstallmentTab; q?: string; page?: number }) {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const tab = params.tab ?? "all";
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : undefined;
  const where = sql.join(
    [
      tabFilter(tab, today),
      like ? sql`(c.code ilike ${like} or cu.full_name ilike ${like} or cu.code ilike ${like} or c.product_description ilike ${like})` : undefined,
    ].filter(Boolean) as SQL[],
    sql` and `,
  );

  const rows = await db.execute<{
    id: string;
    seq: number;
    code: string;
    customer_name: string;
    customer_code: string;
    product_description: string;
    due_date: string;
    amount: string;
    paid_amount: string;
    waived_amount: string;
    total: string;
  }>(sql`
    select i.id, i.seq, i.due_date, i.amount, i.paid_amount, i.waived_amount,
      c.code, c.product_description, cu.full_name as customer_name, cu.code as customer_code,
      count(*) over () as total
    from installments i
    join contracts c on c.id = i.contract_id
    join customers cu on cu.id = c.customer_id
    where ${where}
    order by ${tab === "paid" ? sql`i.due_date desc` : sql`i.due_date asc`}, c.code, i.seq
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);

  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    items: rows.map((r): InstallmentListItem => {
      const amount = Number(r.amount);
      const paidAmount = Number(r.paid_amount);
      const waivedAmount = Number(r.waived_amount);
      const left = amount - paidAmount - waivedAmount;
      return {
        id: r.id,
        seq: r.seq,
        contractCode: r.code,
        customerName: r.customer_name,
        customerCode: r.customer_code,
        productDescription: r.product_description,
        dueDate: r.due_date,
        amount,
        paid: paidAmount,
        remaining: left,
        daysLate: left > 0 ? Math.max(0, daysBetween(r.due_date, today)) : 0,
        status: installmentStatus({ amount, paidAmount, waivedAmount, dueDate: r.due_date }, today),
      };
    }),
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type InstallmentBucket = { amount: number; count: number };

/** Unpaid amounts on active contracts: due today, overdue, and due within the next 30 days. */
export async function getInstallmentSummary() {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const until = addDays(today, UPCOMING_DAYS);
  const [r] = await db.execute<Record<string, string>>(sql`
    select
      coalesce(sum(${remaining}) filter (where i.due_date = ${today}), 0) as today_amount,
      count(*) filter (where i.due_date = ${today}) as today_count,
      coalesce(sum(${remaining}) filter (where i.due_date < ${today}), 0) as overdue_amount,
      count(*) filter (where i.due_date < ${today}) as overdue_count,
      coalesce(sum(${remaining}) filter (where i.due_date > ${today} and i.due_date <= ${until}), 0) as upcoming_amount,
      count(*) filter (where i.due_date > ${today} and i.due_date <= ${until}) as upcoming_count
    from installments i join contracts c on c.id = i.contract_id
    where ${open}`);
  const bucket = (name: string): InstallmentBucket => ({ amount: Number(r[`${name}_amount`]), count: Number(r[`${name}_count`]) });
  return { asOf: today, today: bucket("today"), overdue: bucket("overdue"), upcoming: bucket("upcoming") };
}
