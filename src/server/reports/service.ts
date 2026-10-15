import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { addDays, daysBetween, previousRange, resolveRange, type DateRange, type PeriodPreset } from "@/server/finance/period";
import { todayInCairo } from "@/server/time";
import { paymentMethodLabels } from "@/lib/payments";

/*
 * Reports (Figma "reports"). Every report is one SQL query returning the table
 * rows; the KPI cards are totals of those rows. Money is piastres.
 *
 * Installment payments carry no date of their own yet, so collection is
 * measured against due dates: "collected in a month" is what has been paid on
 * the installments that fall due in that month. Paid money covers an
 * installment's fees first, then its profit, then its principal (same order as
 * the early-settlement quote).
 */

export type ReportColumnKind = "text" | "contract" | "money" | "count" | "percent" | "date" | "month";
export type ReportColumn = { key: string; header: string; kind: ReportColumnKind };
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export type ReportKpi = {
  label: string;
  value: number | null;
  kind: "money" | "count" | "percent";
  /** Percentage change against the preceding period of the same length; null when there is nothing to compare. */
  change?: number | null;
};

type ReportDef = {
  title: string;
  description: string;
  /** False for "as of today" reports, which ignore the period. */
  ranged: boolean;
  /** Collection figures are attributed to the installment's due date. */
  byDueDate?: boolean;
  columns: ReportColumn[];
  query: (range: DateRange, today: string) => SQL;
  kpis: (rows: ReportRow[]) => Omit<ReportKpi, "change">[];
  note?: string;
};

const MAX_ROWS = 5000;
const MAX_RANGE_DAYS = 3660;

const col = (key: string, header: string, kind: ReportColumnKind = "text"): ReportColumn => ({ key, header, kind });
const sum = (rows: ReportRow[], key: string) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
const rate = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null);
const distinct = (rows: ReportRow[], key: string) => new Set(rows.map((r) => r[key])).size;
const money = (label: string, value: number): Omit<ReportKpi, "change"> => ({ label, value, kind: "money" });
const count = (label: string, value: number): Omit<ReportKpi, "change"> => ({ label, value, kind: "count" });
const percent = (label: string, value: number | null): Omit<ReportKpi, "change"> => ({ label, value, kind: "percent" });

const confirmed = sql`c.status not in ('draft', 'cancelled')`;
const confirmedOn = sql`(c.confirmed_at at time zone 'Africa/Cairo')::date`;
const remaining = sql`(i.amount - i.paid_amount - i.waived_amount)`;
const feesPaid = sql`least(i.fees, i.paid_amount)`;
const profitPaid = sql`least(i.profit, greatest(0, i.paid_amount - i.fees))`;
const principalPaid = sql`greatest(0, i.paid_amount - i.fees - i.profit)`;
const dueMonth = sql`to_char(i.due_date, 'YYYY-MM')`;
const pct = (part: SQL, total: SQL) => sql`case when ${total} > 0 then round(${part} * 100.0 / ${total}, 1) end`;
const inRange = (expr: SQL, r: DateRange) => sql`${expr} between ${r.from} and ${r.to}`;

const reportDefs = {
  sales: {
    title: "المبيعات",
    description: "العقود المؤكدة في الفترة وقيمة البيع بالتقسيط.",
    ranged: true,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("date", "تاريخ التأكيد", "date"),
      col("product", "المشتريات"),
      col("original_price", "السعر الأصلي", "money"),
      col("purchase_cost", "سعر البيع", "money"),
      col("down_payment", "المقدم", "money"),
      col("sale_price", "سعر البيع بالتقسيط", "money"),
    ],
    query: (r) => sql`
      select c.code as contract, cu.full_name as customer, ${confirmedOn} as date, c.product_description as product,
        c.original_price, c.purchase_cost, c.down_payment, c.down_payment + c.total_installments as sale_price
      from contracts c join customers cu on cu.id = c.customer_id
      where ${confirmed} and ${inRange(confirmedOn, r)}
      order by date desc, c.code desc`,
    kpis: (rows) => [
      count("عدد العقود", rows.length),
      money("سعر البيع", sum(rows, "purchase_cost")),
      money("المقدمات", sum(rows, "down_payment")),
      money("قيمة البيع بالتقسيط", sum(rows, "sale_price")),
    ],
  },
  principal: {
    title: "أصل التمويل",
    description: "الأصل المموَّل للعقود المؤكدة في الفترة وما استُرد منه.",
    ranged: true,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("date", "تاريخ التأكيد", "date"),
      col("principal", "الأصل المموَّل", "money"),
      col("principal_paid", "المسترد", "money"),
      col("principal_remaining", "المتبقي من الأصل", "money"),
    ],
    query: (r) => sql`
      select c.code as contract, cu.full_name as customer, ${confirmedOn} as date, c.principal,
        coalesce(p.paid, 0) as principal_paid, c.principal - coalesce(p.paid, 0) as principal_remaining
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join (select i.contract_id, sum(${principalPaid}) as paid from installments i group by 1) p on p.contract_id = c.id
      where ${confirmed} and ${inRange(confirmedOn, r)}
      order by date desc, c.code desc`,
    kpis: (rows) => [
      money("الأصل المموَّل", sum(rows, "principal")),
      money("المسترد", sum(rows, "principal_paid")),
      money("المتبقي من الأصل", sum(rows, "principal_remaining")),
      percent("نسبة الاسترداد", rate(sum(rows, "principal_paid"), sum(rows, "principal"))),
    ],
  },
  "finance-revenue": {
    title: "إيرادات التمويل",
    description: "عائد التمويل المجدول لكل شهر، وما حُصّل أو أُعفي منه.",
    ranged: true,
    byDueDate: true,
    columns: [
      col("month", "الشهر", "month"),
      col("profit", "العائد المجدول", "money"),
      col("profit_paid", "العائد المحصّل", "money"),
      col("profit_waived", "المعفى بالتسوية", "money"),
      col("profit_remaining", "عائد لم يُحصّل", "money"),
      col("fees_paid", "رسوم محصّلة", "money"),
    ],
    query: (r) => sql`
      select ${dueMonth} as month, sum(i.profit) as profit, sum(${profitPaid}) as profit_paid,
        sum(i.waived_amount) as profit_waived, sum(i.profit - ${profitPaid} - i.waived_amount) as profit_remaining,
        sum(${feesPaid}) as fees_paid
      from installments i
      where ${inRange(sql`i.due_date`, r)}
      group by 1 order by 1`,
    kpis: (rows) => [
      money("العائد المجدول", sum(rows, "profit")),
      money("العائد المحصّل", sum(rows, "profit_paid")),
      money("المعفى بالتسوية", sum(rows, "profit_waived")),
      money("رسوم محصّلة", sum(rows, "fees_paid")),
    ],
  },
  "expected-collection": {
    title: "التحصيل المتوقع",
    description: "الأقساط التي تستحق في الفترة، شهرًا بشهر.",
    ranged: true,
    columns: [
      col("month", "الشهر", "month"),
      col("installments", "عدد الأقساط", "count"),
      col("expected", "المتوقع", "money"),
      col("collected", "المسدّد منه", "money"),
      col("remaining", "المتبقي", "money"),
    ],
    query: (r) => sql`
      select ${dueMonth} as month, count(*) as installments, sum(i.amount - i.waived_amount) as expected,
        sum(i.paid_amount) as collected, sum(${remaining}) as remaining
      from installments i
      where ${inRange(sql`i.due_date`, r)}
      group by 1 order by 1`,
    kpis: (rows) => [
      money("المتوقع", sum(rows, "expected")),
      money("المسدّد منه", sum(rows, "collected")),
      money("المتبقي", sum(rows, "remaining")),
      count("عدد الأقساط", sum(rows, "installments")),
    ],
  },
  "actual-collection": {
    title: "التحصيل الفعلي",
    description: "ما سُدّد من أقساط الفترة لكل عقد.",
    ranged: true,
    byDueDate: true,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("installments", "أقساط الفترة", "count"),
      col("due", "المستحق", "money"),
      col("collected", "المحصّل", "money"),
      col("remaining", "المتبقي", "money"),
    ],
    query: (r) => sql`
      select c.code as contract, cu.full_name as customer, count(*) as installments,
        sum(i.amount - i.waived_amount) as due, sum(i.paid_amount) as collected, sum(${remaining}) as remaining
      from installments i
      join contracts c on c.id = i.contract_id
      join customers cu on cu.id = c.customer_id
      where ${inRange(sql`i.due_date`, r)}
      group by c.id, cu.id
      order by collected desc, c.code`,
    kpis: (rows) => [
      money("المحصّل", sum(rows, "collected")),
      money("المستحق", sum(rows, "due")),
      money("المتبقي", sum(rows, "remaining")),
      percent("معدل التحصيل", rate(sum(rows, "collected"), sum(rows, "due"))),
    ],
  },
  portfolio: {
    title: "المحفظة القائمة",
    description: "العقود النشطة وأرصدتها حتى اليوم.",
    ranged: false,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("product", "المشتريات"),
      col("total", "إجمالي الأقساط", "money"),
      col("paid", "المسدّد", "money"),
      col("outstanding", "القائم", "money"),
      col("overdue", "المتأخر", "money"),
    ],
    query: (_r, today) => sql`
      select c.code as contract, cu.full_name as customer, c.product_description as product, c.total_installments as total,
        coalesce(sum(i.paid_amount), 0) as paid, coalesce(sum(${remaining}), 0) as outstanding,
        coalesce(sum(${remaining}) filter (where i.due_date < ${today}), 0) as overdue
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join installments i on i.contract_id = c.id
      where c.status = 'active'
      group by c.id, cu.id
      order by outstanding desc, c.code`,
    kpis: (rows) => [
      count("العقود النشطة", rows.length),
      money("إجمالي الأقساط", sum(rows, "total")),
      money("الرصيد القائم", sum(rows, "outstanding")),
      money("المتأخر", sum(rows, "overdue")),
    ],
  },
  overdue: {
    title: "المتأخرات",
    description: "العقود التي عليها أقساط فات ميعادها، الأقدم أولًا.",
    ranged: false,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("phone", "الهاتف"),
      col("installments", "أقساط متأخرة", "count"),
      col("overdue", "المتأخر", "money"),
      col("oldest", "أقدم استحقاق", "date"),
      col("days_late", "أيام التأخير", "count"),
    ],
    query: (_r, today) => sql`
      select c.code as contract, cu.full_name as customer, cu.phone, count(*) as installments,
        sum(${remaining}) as overdue, min(i.due_date) as oldest, ${today}::date - min(i.due_date) as days_late
      from installments i
      join contracts c on c.id = i.contract_id
      join customers cu on cu.id = c.customer_id
      where c.status = 'active' and i.due_date < ${today} and ${remaining} > 0
      group by c.id, cu.id
      order by oldest, c.code`,
    kpis: (rows) => [
      money("إجمالي المتأخر", sum(rows, "overdue")),
      count("عقود متأخرة", rows.length),
      count("عملاء متأخرون", distinct(rows, "phone")),
      count("أقصى تأخير (يوم)", rows.reduce((m, r) => Math.max(m, Number(r.days_late) || 0), 0)),
    ],
  },
  "collection-rate": {
    title: "معدل التحصيل",
    description: "نسبة المسدّد من مستحقات كل شهر.",
    ranged: true,
    byDueDate: true,
    columns: [
      col("month", "الشهر", "month"),
      col("due", "المستحق", "money"),
      col("collected", "المحصّل", "money"),
      col("late", "متأخر لم يُسدّد", "money"),
      col("rate", "معدل التحصيل", "percent"),
    ],
    query: (r, today) => sql`
      select ${dueMonth} as month, sum(i.amount - i.waived_amount) as due, sum(i.paid_amount) as collected,
        coalesce(sum(${remaining}) filter (where i.due_date < ${today}), 0) as late,
        ${pct(sql`sum(i.paid_amount)`, sql`sum(i.amount - i.waived_amount)`)} as rate
      from installments i
      where ${inRange(sql`i.due_date`, r)}
      group by 1 order by 1`,
    kpis: (rows) => [
      percent("معدل التحصيل", rate(sum(rows, "collected"), sum(rows, "due"))),
      money("المستحق", sum(rows, "due")),
      money("المحصّل", sum(rows, "collected")),
      money("متأخر لم يُسدّد", sum(rows, "late")),
    ],
  },
  "early-settlements": {
    title: "التسويات المبكرة",
    description: "العقود التي أُغلقت بتسوية مبكرة في الفترة.",
    ranged: true,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("date", "تاريخ التسوية", "date"),
      col("remaining_principal", "أصل متبقٍ", "money"),
      col("accrued_profit", "عائد مستحق", "money"),
      col("waived_profit", "عائد معفى", "money"),
      col("amount", "المبلغ المحصّل", "money"),
      col("method", "الوسيلة"),
    ],
    query: (r) => sql`
      select c.code as contract, cu.full_name as customer, s.settled_on as date, s.remaining_principal,
        s.accrued_profit, s.waived_profit, s.amount, s.payment_method::text as method
      from contract_settlements s
      join contracts c on c.id = s.contract_id
      join customers cu on cu.id = c.customer_id
      where ${inRange(sql`s.settled_on`, r)}
      order by s.settled_on desc, c.code`,
    kpis: (rows) => [
      count("عدد التسويات", rows.length),
      money("المبلغ المحصّل", sum(rows, "amount")),
      money("عائد معفى", sum(rows, "waived_profit")),
    ],
  },
  "completed-contracts": {
    title: "العقود المكتملة",
    description: "العقود التي سُدّدت كل أقساطها.",
    ranged: false,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("product", "المشتريات"),
      col("principal", "الأصل", "money"),
      col("profit", "العائد", "money"),
      col("total", "إجمالي الأقساط", "money"),
      col("last_due", "آخر استحقاق", "date"),
    ],
    query: () => sql`
      select c.code as contract, cu.full_name as customer, c.product_description as product, c.principal, c.profit,
        c.total_installments as total, (select max(i.due_date) from installments i where i.contract_id = c.id) as last_due
      from contracts c join customers cu on cu.id = c.customer_id
      where c.status = 'completed'
      order by last_due desc nulls last, c.code desc`,
    kpis: (rows) => [
      count("عدد العقود", rows.length),
      money("الأصل", sum(rows, "principal")),
      money("العائد", sum(rows, "profit")),
      money("إجمالي الأقساط", sum(rows, "total")),
    ],
  },
  "consolidated-contracts": {
    title: "العقود المدمجة",
    description: "مجموعات المتابعة القائمة وأرصدة عقودها.",
    ranged: false,
    columns: [
      col("group_name", "المجموعة"),
      col("customer", "العميل"),
      col("contracts", "عدد العقود", "count"),
      col("codes", "العقود"),
      col("outstanding", "القائم", "money"),
      col("overdue", "المتأخر", "money"),
    ],
    query: (_r, today) => sql`
      select g.name as group_name, cu.full_name as customer, count(distinct c.id) as contracts,
        string_agg(distinct c.code, ' • ') as codes,
        coalesce(sum(${remaining}), 0) as outstanding,
        coalesce(sum(${remaining}) filter (where i.due_date < ${today}), 0) as overdue
      from contract_groups g
      join customers cu on cu.id = g.customer_id
      join contracts c on c.group_id = g.id
      left join installments i on i.contract_id = c.id
      where g.dissolved_at is null
      group by g.id, cu.id
      order by outstanding desc, g.name`,
    kpis: (rows) => [
      count("عدد المجموعات", rows.length),
      count("عقود ضمن مجموعات", sum(rows, "contracts")),
      money("الرصيد القائم", sum(rows, "outstanding")),
      money("المتأخر", sum(rows, "overdue")),
    ],
  },
  "contract-profitability": {
    title: "ربحية العقود",
    description: "عائد كل عقد مؤكد في الفترة مقارنة بأصله.",
    ranged: true,
    columns: [
      col("contract", "العقد", "contract"),
      col("customer", "العميل"),
      col("principal", "الأصل", "money"),
      col("profit", "العائد المجدول", "money"),
      col("profit_paid", "العائد المحصّل", "money"),
      col("profit_waived", "العائد المعفى", "money"),
      col("margin", "هامش العائد", "percent"),
    ],
    query: (r) => sql`
      select c.code as contract, cu.full_name as customer, c.principal, c.profit,
        coalesce(p.paid, 0) as profit_paid, coalesce(p.waived, 0) as profit_waived,
        ${pct(sql`c.profit`, sql`c.principal`)} as margin
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join (
        select i.contract_id, sum(${profitPaid}) as paid, sum(i.waived_amount) as waived from installments i group by 1
      ) p on p.contract_id = c.id
      where ${confirmed} and ${inRange(confirmedOn, r)}
      order by c.profit desc, c.code`,
    kpis: (rows) => [
      money("العائد المجدول", sum(rows, "profit")),
      money("العائد المحصّل", sum(rows, "profit_paid")),
      money("العائد المعفى", sum(rows, "profit_waived")),
      percent("متوسط هامش العائد", rate(sum(rows, "profit"), sum(rows, "principal"))),
    ],
  },
  "customer-payments": {
    title: "سداد العملاء",
    description: "التزام كل عميل بسداد أقساط الفترة.",
    ranged: true,
    byDueDate: true,
    columns: [
      col("code", "رقم العميل"),
      col("customer", "العميل"),
      col("installments", "أقساط الفترة", "count"),
      col("due", "المستحق", "money"),
      col("paid", "المسدّد", "money"),
      col("late", "متأخر", "money"),
      col("rate", "نسبة السداد", "percent"),
    ],
    query: (r, today) => sql`
      select cu.code, cu.full_name as customer, count(*) as installments,
        sum(i.amount - i.waived_amount) as due, sum(i.paid_amount) as paid,
        coalesce(sum(${remaining}) filter (where i.due_date < ${today}), 0) as late,
        ${pct(sql`sum(i.paid_amount)`, sql`sum(i.amount - i.waived_amount)`)} as rate
      from installments i
      join contracts c on c.id = i.contract_id
      join customers cu on cu.id = c.customer_id
      where ${inRange(sql`i.due_date`, r)}
      group by cu.id
      order by late desc, cu.code`,
    kpis: (rows) => [
      count("عدد العملاء", rows.length),
      money("المستحق", sum(rows, "due")),
      money("المسدّد", sum(rows, "paid")),
      percent("نسبة السداد", rate(sum(rows, "paid"), sum(rows, "due"))),
    ],
  },
  "monthly-collection": {
    title: "التحصيل حسب الشهر",
    description: "المحصّل من أقساط كل شهر موزّعًا على الأصل والعائد والرسوم.",
    ranged: true,
    byDueDate: true,
    columns: [
      col("month", "الشهر", "month"),
      col("collected", "المحصّل", "money"),
      col("principal_paid", "من الأصل", "money"),
      col("profit_paid", "من العائد", "money"),
      col("fees_paid", "من الرسوم", "money"),
    ],
    query: (r) => sql`
      select ${dueMonth} as month, sum(i.paid_amount) as collected, sum(${principalPaid}) as principal_paid,
        sum(${profitPaid}) as profit_paid, sum(${feesPaid}) as fees_paid
      from installments i
      where ${inRange(sql`i.due_date`, r)}
      group by 1 order by 1`,
    kpis: (rows) => [
      money("المحصّل", sum(rows, "collected")),
      money("من الأصل", sum(rows, "principal_paid")),
      money("من العائد", sum(rows, "profit_paid")),
      money("من الرسوم", sum(rows, "fees_paid")),
    ],
  },
  "cash-flow": {
    title: "التدفق النقدي",
    description: "الخارج لشراء البضاعة مقابل الداخل من المقدمات والأقساط.",
    ranged: true,
    byDueDate: true,
    columns: [
      col("month", "الشهر", "month"),
      col("purchases", "مشتريات (خارج)", "money"),
      col("down_payments", "مقدمات (داخل)", "money"),
      col("collected", "أقساط (داخل)", "money"),
      col("net", "الصافي", "money"),
    ],
    query: (r) => sql`
      with m as (
        select to_char(d, 'YYYY-MM') as month
        from generate_series(date_trunc('month', ${r.from}::date), ${r.to}::date, interval '1 month') d
      ), k as (
        select to_char(${confirmedOn}, 'YYYY-MM') as month, sum(c.purchase_cost) as purchases, sum(c.down_payment) as downs
        from contracts c where ${confirmed} and ${inRange(confirmedOn, r)} group by 1
      ), p as (
        select ${dueMonth} as month, sum(i.paid_amount) as collected
        from installments i where ${inRange(sql`i.due_date`, r)} group by 1
      )
      select m.month, coalesce(k.purchases, 0) as purchases, coalesce(k.downs, 0) as down_payments,
        coalesce(p.collected, 0) as collected,
        coalesce(k.downs, 0) + coalesce(p.collected, 0) - coalesce(k.purchases, 0) as net
      from m left join k using (month) left join p using (month)
      order by m.month`,
    kpis: (rows) => [
      money("الداخل", sum(rows, "down_payments") + sum(rows, "collected")),
      money("الخارج", sum(rows, "purchases")),
      money("الصافي", sum(rows, "net")),
    ],
  },
  ledger: {
    title: "دفتر الأستاذ المالي",
    description: "الحركات المؤرخة: تمويل العقود، المقدمات والتسويات المبكرة.",
    ranged: true,
    note: "أقساط العقود تظهر في تقارير التحصيل حسب شهر الاستحقاق، وتُضاف هنا كحركات مؤرخة عند تسجيل المدفوعات.",
    columns: [
      col("date", "التاريخ", "date"),
      col("contract", "المرجع", "contract"),
      col("customer", "العميل"),
      col("entry", "البيان"),
      col("cash_in", "داخل", "money"),
      col("cash_out", "خارج", "money"),
      col("balance", "الرصيد", "money"),
    ],
    query: (r) => sql`
      with e as (
        select ${confirmedOn} as date, 1 as ord, c.code, c.customer_id, 'تمويل شراء' as entry, 0::bigint as cash_in, c.purchase_cost as cash_out
        from contracts c where ${confirmed} and ${inRange(confirmedOn, r)}
        union all
        select ${confirmedOn}, 2, c.code, c.customer_id, 'مقدم العقد', c.down_payment, 0
        from contracts c where ${confirmed} and c.down_payment > 0 and ${inRange(confirmedOn, r)}
        union all
        select s.settled_on, 3, c.code, c.customer_id, 'تسوية مبكرة', s.amount, 0
        from contract_settlements s join contracts c on c.id = s.contract_id
        where ${inRange(sql`s.settled_on`, r)}
      )
      select e.date, e.code as contract, cu.full_name as customer, e.entry, e.cash_in, e.cash_out,
        sum(e.cash_in - e.cash_out) over (order by e.date, e.code, e.ord) as balance
      from e join customers cu on cu.id = e.customer_id
      order by e.date, e.code, e.ord`,
    kpis: (rows) => [
      money("إجمالي الداخل", sum(rows, "cash_in")),
      money("إجمالي الخارج", sum(rows, "cash_out")),
      money("الصافي", sum(rows, "cash_in") - sum(rows, "cash_out")),
      count("عدد الحركات", rows.length),
    ],
  },
} satisfies Record<string, ReportDef>;

export type ReportSlug = keyof typeof reportDefs;
const defs: Record<string, ReportDef> = reportDefs;

export const reportPresets = ["year", "quarter", "month", "custom"] as const satisfies readonly PeriodPreset[];
export type ReportPreset = (typeof reportPresets)[number];

export type ReportSummary = { slug: ReportSlug; title: string; description: string; ranged: boolean };

/** The report catalogue, in the order of the Figma "reports" screen. */
export async function listReports(): Promise<ReportSummary[]> {
  await requirePermission("reports:read");
  return (Object.keys(reportDefs) as ReportSlug[]).map((slug) => {
    const { title, description, ranged } = defs[slug];
    return { slug, title, description, ranged };
  });
}

export function isReportSlug(slug: string): slug is ReportSlug {
  return Object.hasOwn(reportDefs, slug);
}

export type Report = ReportSummary & {
  /** Null for "as of today" reports. */
  range: DateRange | null;
  asOf: string;
  byDueDate: boolean;
  note: string | null;
  columns: ReportColumn[];
  kpis: ReportKpi[];
  rows: ReportRow[];
  /** True when the result was cut at the row limit. */
  truncated: boolean;
};

async function fetchRows(def: ReportDef, range: DateRange, today: string): Promise<ReportRow[]> {
  const raw = await db.execute<Record<string, unknown>>(sql`${def.query(range, today)} limit ${MAX_ROWS + 1}`);
  return raw.map((r) => {
    const row: ReportRow = {};
    for (const c of def.columns) {
      const v = r[c.key];
      if (v === null || v === undefined) row[c.key] = null;
      else if (c.kind === "money" || c.kind === "count" || c.kind === "percent") row[c.key] = Number(v);
      else row[c.key] = String(v);
    }
    if (typeof row.method === "string" && row.method in paymentMethodLabels) {
      row.method = paymentMethodLabels[row.method as keyof typeof paymentMethodLabels];
    }
    return row;
  });
}

function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export async function getReport(
  slug: string,
  params: { period?: ReportPreset; from?: unknown; to?: unknown } = {},
): Promise<Report> {
  await requirePermission("reports:read");
  if (!isReportSlug(slug)) throw new AppError("not_found", "التقرير غير موجود");
  const def = defs[slug];
  const today = todayInCairo();

  let range = resolveRange(params.period ?? "year", today, params);
  if (daysBetween(range.from, range.to) > MAX_RANGE_DAYS) range = { from: range.from, to: addDays(range.from, MAX_RANGE_DAYS) };

  const [all, previous] = await Promise.all([
    fetchRows(def, range, today),
    def.ranged ? fetchRows(def, previousRange(range), today) : Promise.resolve(null),
  ]);
  const truncated = all.length > MAX_ROWS;
  const rows = truncated ? all.slice(0, MAX_ROWS) : all;
  const before = previous ? def.kpis(previous) : null;

  return {
    slug,
    title: def.title,
    description: def.description,
    ranged: def.ranged,
    range: def.ranged ? range : null,
    asOf: today,
    byDueDate: def.byDueDate ?? false,
    note: def.note ?? null,
    columns: def.columns,
    // Rates are compared by eye, not as a percentage of a percentage.
    kpis: def.kpis(rows).map((k, i) => ({
      ...k,
      change: before && k.kind !== "percent" ? change(k.value, before[i]?.value ?? null) : undefined,
    })),
    rows,
    truncated,
  };
}

/** Excel-friendly CSV: amounts in pounds with two decimals, text cells guarded against formula injection. */
export function reportToCsv(report: Report): string {
  const cell = (v: ReportCell, kind: ReportColumnKind) => {
    if (v === null) return "";
    if (kind === "money") return (Number(v) / 100).toFixed(2);
    if (typeof v === "number") return String(v);
    const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    report.columns.map((c) => cell(c.header, "text")).join(","),
    ...report.rows.map((r) => report.columns.map((c) => cell(r[c.key], c.kind)).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
