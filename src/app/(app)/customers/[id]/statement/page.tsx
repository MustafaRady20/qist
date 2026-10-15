import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DetailList, EmptyState, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, Button, ButtonLink, DateField, SelectField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatAmount, formatDate, formatPhone, installmentsCountLabel } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/payments";
import { entryStatusLabels, entryTypeLabels, installmentFilterLabels } from "@/lib/statement";
import { queryString } from "@/lib/url";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import {
  statementEntryTypes,
  statementInstallmentFilters,
  type StatementEntry,
  type StatementInstallmentRow,
  type StatementPlan,
} from "@/server/finance/statement";
import { getCustomerStatement, type StatementPeriod } from "@/server/statements/service";
import { orNotFound } from "../../../contracts/load";
import { ReversePaymentButton } from "./ReversePaymentButton";
import { StatementActions } from "./StatementActions";

export const metadata: Metadata = { title: "كشف حساب العميل · قسط" };

const periods: { value: StatementPeriod; label: string }[] = [
  { value: "all", label: "كل الفترات" },
  { value: "month", label: "هذا الشهر" },
  { value: "lastMonth", label: "الشهر الماضي" },
  { value: "custom", label: "فترة مخصصة" },
];

const money = (p: number) => <span className="num">{formatAmount(p)}</span>;
const amountOrDash = (p: number) => (p ? money(p) : <span className="text-muted">—</span>);
const count = (n: number) => <span className="num">{n}</span>;

const installmentColumns: Column<StatementInstallmentRow>[] = [
  { key: "seq", header: "القسط", cell: (r) => r.seq, numeric: true },
  { key: "due", header: "الاستحقاق", cell: (r) => <span className={cn(r.late && "text-dangerText")}>{formatDate(r.dueDate)}</span> },
  { key: "amount", header: "المبلغ", cell: (r) => formatAmount(r.amount), numeric: true },
  { key: "paid", header: "المدفوع", cell: (r) => formatAmount(r.paid), numeric: true },
  { key: "paidOn", header: "تاريخ السداد", cell: (r) => (r.paidOn ? formatDate(r.paidOn) : "—") },
  {
    key: "remaining",
    header: "المتبقي",
    cell: (r) => <span className={cn(r.late && "font-bold text-dangerText")}>{formatAmount(r.remaining)}</span>,
    numeric: true,
  },
  {
    key: "status",
    header: "الحالة",
    cell: (r) =>
      // A late partial payment is still late: say both.
      r.late && r.status === "partial" ? (
        <Badge tone="danger" className="min-w-28">
          جزئي • متأخر
        </Badge>
      ) : (
        <Badge status={r.status} className="min-w-28" />
      ),
  },
];

function PlanCard({ plan, filtered }: { plan: StatementPlan; filtered: boolean }) {
  const facts: { label: string; value: React.ReactNode; danger?: boolean }[] = [
    { label: "سعر البيع بالتقسيط", value: money(plan.sellingPrice) },
    { label: "المقدم", value: money(plan.deposit) },
    { label: "الرسوم", value: money(plan.fees) },
    { label: "إجمالي المستحق", value: money(plan.totalDue) },
    { label: "إجمالي المدفوع", value: money(plan.totalPaid) },
    ...(plan.discount > 0 ? [{ label: "خصم التسوية المبكرة", value: money(plan.discount) }] : []),
    { label: "الرصيد المتبقي", value: money(plan.remaining), danger: plan.overdueCount > 0 },
    { label: "عدد الأقساط", value: installmentsCountLabel(plan.installmentCount) },
    { label: "دورية القسط", value: "شهري" },
    { label: "أول قسط", value: formatDate(plan.firstDueDate) },
    { label: "الاستحقاق القادم", value: plan.nextDueDate ? formatDate(plan.nextDueDate) : "—" },
    { label: "أقساط مسددة", value: count(plan.paidCount) },
    { label: "أقساط غير مسددة", value: count(plan.unpaidCount) },
    { label: "أقساط متأخرة", value: count(plan.overdueCount), danger: plan.overdueCount > 0 },
  ];

  return (
    <article className={cn("flex flex-col gap-4 rounded-card border p-4 break-inside-avoid", plan.overdueCount > 0 ? "border-danger" : "border-border")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-h4 text-navy">
          <Link href={`/contracts/${plan.code}`} className="num underline-offset-4 hover:underline">
            {plan.code}
          </Link>{" "}
          • {plan.product}
        </h3>
        <Badge status={plan.status} />
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 xl:grid-cols-5">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col">
            <dt className="text-caption text-secondary">{f.label}</dt>
            <dd className={cn("text-num-sm", f.danger ? "text-dangerText" : "text-text")}>{f.value}</dd>
          </div>
        ))}
      </dl>
      <details className="group">
        <summary className="text-label cursor-pointer text-infoText select-none print:hidden">
          <span className="group-open:hidden">عرض الأقساط</span>
          <span className="hidden group-open:inline">إخفاء الأقساط</span>
          {filtered && <> • {installmentsCountLabel(plan.installments.length)} مطابقة للتصفية</>}
        </summary>
        <div className="pt-4">
          {plan.installments.length ? (
            <DataTable caption={`أقساط العقد ${plan.code}`} columns={installmentColumns} rows={plan.installments} rowKey={(r) => r.id} />
          ) : (
            <p className="text-body text-secondary">لا توجد أقساط بهذه الحالة في هذا العقد.</p>
          )}
        </div>
      </details>
    </article>
  );
}

const th = "text-label bg-bg px-2 py-3 font-medium text-secondary";
const td = "text-body border-b border-border px-2 py-3 align-top";

export default async function CustomerStatementPage({ params, searchParams }: PageProps<"/customers/[id]/statement">) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const period = pickTab(periods, sp.period);
  const code = decodeURIComponent((await params).id);

  let s;
  try {
    s = await orNotFound(() =>
      getCustomerStatement(code, { period, from: one(sp.from), to: one(sp.to), type: one(sp.type), contract: one(sp.contract), installments: one(sp.installments) }),
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "forbidden") return <Notice tone="danger">ليست لديك صلاحية لعرض كشف حساب العملاء.</Notice>;
    throw error;
  }

  const c = s.customer;
  const { summary: m, period: p, filters: f } = s;
  const canReverse = can(user.role, "payments:reverse");
  const canPay = can(user.role, "payments:write");
  const custom = period === "custom" ? { from: p.from ?? undefined, to: p.to ?? undefined } : {};
  const active = { period, ...custom, type: f.type ?? undefined, contract: f.contract ?? undefined, installments: f.installments ?? undefined };
  const periodLabel =
    p.from && p.to
      ? `من ${formatDate(p.from)} إلى ${formatDate(p.to)}`
      : p.from
        ? `من ${formatDate(p.from)} حتى ${formatDate(s.asOf)}`
        : p.to
          ? `من بداية التعامل حتى ${formatDate(p.to)}`
          : `كشف شامل حتى ${formatDate(s.asOf)}`;
  const ranged = !!(p.from || p.to);
  const scoped = s.contracts.find((k) => k.code === f.contract);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="كشف حساب العميل"
          description={
            <>
              {c.fullName} • <span className="num">{c.code}</span> • {periodLabel}
            </>
          }
          breadcrumbs={[
            { label: "الرئيسية", href: "/" },
            { label: "العملاء", href: "/customers" },
            { label: c.fullName, href: `/customers/${c.code}` },
            { label: "كشف الحساب" },
          ]}
          action={
            <StatementActions
              csvHref={`/api/v1/customers/${c.code}/statement${queryString({ ...active, format: "csv" })}`}
              fileName={`كشف-حساب-${c.code}-${p.to ?? s.asOf}`}
            />
          }
        />
      </div>

      {/* Letterhead of the printed / PDF statement. */}
      <header className="hidden items-center justify-between border-b border-border pb-4 print:flex">
        <div className="flex items-center gap-3">
          <Image src="/brand/qist-mark.svg" alt="" width={36} height={36} />
          <div>
            <p className="text-h3 text-navy">قسط</p>
            <p className="text-caption text-secondary">إدارة الأقساط والتحصيل</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-h3 text-navy">كشف حساب عميل</p>
          <p className="text-caption text-secondary">تاريخ الإصدار: {formatDate(s.asOf)}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 print:hidden">
        <ButtonLink href={`/customers/${c.code}`} variant="outline" className="max-md:flex-1 md:w-40">
          ملف العميل
        </ButtonLink>
        <ButtonLink href="/statements" variant="outline" className="max-md:flex-1 md:w-40">
          عميل آخر
        </ButtonLink>
        {canPay && m.activePlans > 0 && (
          <ButtonLink href={`/payments/new?customer=${c.code}`} variant="outline" className="max-md:flex-1 md:w-40">
            تسجيل دفعة
          </ButtonLink>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
        <Panel title="بيانات العميل">
          <DetailList
            items={[
              { label: "الاسم", value: c.fullName },
              { label: "رقم العميل", value: <span className="num">{c.code}</span> },
              { label: "الهاتف", value: <span className="num">{formatPhone(c.phone)}</span> },
              ...(c.altPhone ? [{ label: "هاتف بديل", value: <span className="num">{formatPhone(c.altPhone)}</span> }] : []),
              { label: "العنوان", value: c.address || "—" },
            ]}
          />
        </Panel>
        <Panel title="بيانات الكشف">
          <DetailList
            items={[
              { label: "تاريخ الإصدار", value: formatDate(s.asOf) },
              { label: "الفترة", value: periodLabel },
              { label: "العقود", value: scoped ? <span className="num">{scoped.code}</span> : "كل عقود العميل" },
              { label: ranged ? "رصيد آخر المدة" : "الرصيد", value: money(p.closing) },
              { label: "الرصيد الحالي المستحق", value: <span className="font-bold text-navy">{money(s.currentBalance)}</span> },
            ]}
          />
        </Panel>
      </div>

      {!s.reconciled && (
        <Notice tone="warning">
          أرصدة الأقساط لا تطابق مجموع الحركات المسجلة لهذا العميل. راجع سجل المدفوعات قبل إرسال الكشف.
        </Notice>
      )}

      {s.contracts.length === 0 ? (
        <Panel>
          <EmptyState
            icon="statement"
            title="لا توجد حركات مالية"
            action={
              <ButtonLink href={`/customers/${c.code}`} variant="outline" className="w-full md:w-65 print:hidden">
                فتح ملف العميل
              </ButtonLink>
            }
          >
            لم يُؤكَّد أي عقد لهذا العميل بعد، فلا مبيعات ولا مدفوعات تظهر في الكشف.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {/* The cards repeat the summary below; paper carries the summary only. */}
          <div className="print:hidden">
          <KpiGrid>
            <KpiCard label="الرصيد المستحق" value={formatAmount(m.outstanding)} note={scoped ? `على العقد ${scoped.code}` : "على كل العقود • جنيه مصري"} highlight />
            <KpiCard label="إجمالي سعر البيع" value={formatAmount(m.sellingPrice)} note="المقدم + كل الأقساط" />
            <KpiCard label="إجمالي المدفوع" value={formatAmount(m.totalPaid)} note="المقدم + ما سُدد فعليًا من الأقساط" />
            <div className={cn("rounded-panel", m.overdueInstallments > 0 && "ring-2 ring-danger")}>
              <KpiCard
                label="المتأخر"
                value={formatAmount(m.overdueAmount)}
                note={m.overdueInstallments > 0 ? `${installmentsCountLabel(m.overdueInstallments)} فات موعدها` : "لا توجد أقساط متأخرة"}
              />
            </div>
          </KpiGrid>
          </div>

          <Panel title="ملخص الحساب" className="break-inside-avoid">
            <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2 print:grid-cols-2">
              <DetailList
                items={[
                  { label: "إجمالي سعر البيع", value: money(m.sellingPrice) },
                  { label: "إجمالي الرسوم (ضمن سعر البيع)", value: money(m.fees) },
                  { label: "إجمالي المقدمات المدفوعة", value: money(m.deposits) },
                  { label: "إجمالي المحصّل من الأقساط", value: money(m.installmentPayments) },
                  { label: "إجمالي المدفوع", value: money(m.totalPaid) },
                ]}
              />
              <DetailList
                items={[
                  ...(m.discounts > 0 ? [{ label: "خصومات التسوية المبكرة", value: money(m.discounts) }] : []),
                  { label: "إجمالي الرصيد المستحق", value: <span className="font-bold text-navy">{money(m.outstanding)}</span> },
                  { label: "خطط تقسيط نشطة", value: count(m.activePlans) },
                  { label: "خطط تقسيط مكتملة", value: count(m.completedPlans) },
                  {
                    label: "أقساط متأخرة",
                    value: <span className={cn(m.overdueInstallments > 0 && "text-dangerText")}>{count(m.overdueInstallments)}</span>,
                  },
                ]}
              />
            </div>
          </Panel>

          <section aria-label="تصفية الكشف" className="flex flex-col gap-4 print:hidden">
            <SegmentedTabs
              items={periods}
              value={period}
              param="period"
              label="فترة الكشف"
              keep={{ type: active.type, contract: active.contract, installments: active.installments }}
            />
            <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] xl:items-center">
              <input type="hidden" name="period" value={period} />
              {period === "custom" && (
                <>
                  <DateField label="من تاريخ" name="from" defaultValue={p.from ?? undefined} max={s.asOf} />
                  <DateField label="إلى تاريخ" name="to" defaultValue={p.to ?? undefined} />
                </>
              )}
              <SelectField label="نوع الحركة" name="type" defaultValue={f.type ?? ""}>
                <option value="">كل الحركات</option>
                {statementEntryTypes.map((t) => (
                  <option key={t} value={t}>
                    {entryTypeLabels[t]}
                  </option>
                ))}
              </SelectField>
              <SelectField label="خطة التقسيط" name="contract" defaultValue={f.contract ?? ""}>
                <option value="">كل العقود</option>
                {s.contracts.map((k) => (
                  <option key={k.id} value={k.code}>
                    {k.code} • {k.product}
                  </option>
                ))}
              </SelectField>
              <SelectField label="حالة سداد الأقساط" name="installments" defaultValue={f.installments ?? ""}>
                <option value="">كل الأقساط</option>
                {statementInstallmentFilters.map((v) => (
                  <option key={v} value={v}>
                    {installmentFilterLabels[v]}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" variant="outline" className="xl:w-32">
                تطبيق
              </Button>
            </form>
          </section>

          <Panel title={<>تفاصيل الحركات المالية • {periodLabel}</>}>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: ranged ? "رصيد أول المدة" : "رصيد البداية", value: p.opening },
                { label: "إجمالي المدين", value: p.debits },
                { label: "إجمالي الدائن", value: p.credits },
                { label: ranged ? "رصيد آخر المدة" : "الرصيد الحالي", value: p.closing, strong: true },
              ].map((x) => (
                <div key={x.label} className={cn("flex flex-col rounded-control p-3", x.strong ? "bg-accentBg" : "bg-bg")}>
                  <dt className="text-caption text-secondary">{x.label}</dt>
                  <dd className="text-num-sm text-navy">{money(x.value)}</dd>
                </div>
              ))}
            </dl>
            {ranged && p.closing !== s.currentBalance && (
              <p className="text-caption text-secondary">
                رصيد آخر المدة يخص الفترة المحددة. الرصيد الحالي المستحق على العميل اليوم: {money(s.currentBalance)} جنيه.
              </p>
            )}
            {f.type && (
              <p className="text-caption text-secondary print:hidden">
                تُعرض حركات «{entryTypeLabels[f.type]}» فقط؛ عمود الرصيد والأرصدة أعلاه محسوبة على كل حركات الفترة.
              </p>
            )}

            {/* Table from md up and always on paper; cards on phones. */}
            <div className="overflow-x-auto max-md:hidden print:block! print:overflow-visible">
              <table className="w-full min-w-[880px] border-separate border-spacing-0 text-right print:min-w-0 print:text-[11px]">
                <caption className="sr-only">الحركات المالية للعميل</caption>
                <thead>
                  <tr>
                    <th scope="col" className={cn(th, "rounded-s-control")}>التاريخ</th>
                    <th scope="col" className={th}>المرجع</th>
                    <th scope="col" className={th}>النوع</th>
                    <th scope="col" className={th}>البيان</th>
                    <th scope="col" className={th}>مدين</th>
                    <th scope="col" className={th}>دائن</th>
                    <th scope="col" className={th}>الرصيد</th>
                    <th scope="col" className={th}>وسيلة الدفع</th>
                    <th scope="col" className={cn(th, "rounded-e-control")}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-bg/60">
                    <td className={td}>{p.from ? formatDate(p.from) : "—"}</td>
                    <td className={td} colSpan={5}>
                      {ranged ? "رصيد أول المدة" : "رصيد البداية"}
                    </td>
                    <td className={cn(td, "font-medium text-navy")}>{money(p.opening)}</td>
                    <td className={td} colSpan={2} />
                  </tr>
                  {s.entries.map((e) => (
                    <LedgerRow key={e.id} e={e} canReverse={canReverse} />
                  ))}
                  {s.entries.length === 0 && (
                    <tr>
                      <td className={cn(td, "py-8 text-center text-secondary")} colSpan={9}>
                        لا توجد حركات في هذه الفترة{f.type ? " بهذا النوع" : ""}.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td className={td} colSpan={4}>
                      إجمالي الحركات المعروضة
                    </td>
                    <td className={td}>{money(s.shown.debits)}</td>
                    <td className={td}>{money(s.shown.credits)}</td>
                    <td className={td} colSpan={3} />
                  </tr>
                  <tr className="bg-accentBg font-bold text-navy">
                    <td className={td}>{formatDate(p.to ?? s.asOf)}</td>
                    <td className={td} colSpan={5}>
                      {ranged ? "رصيد آخر المدة" : "الرصيد الحالي المستحق"}
                    </td>
                    <td className={td}>{money(p.closing)}</td>
                    <td className={td} colSpan={2} />
                  </tr>
                  {ranged && (
                    <tr className="font-medium">
                      <td className={td}>{formatDate(s.asOf)}</td>
                      <td className={td} colSpan={5}>
                        الرصيد الحالي المستحق
                      </td>
                      <td className={td}>{money(s.currentBalance)}</td>
                      <td className={td} colSpan={2} />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            <ul className="flex flex-col gap-3 md:hidden print:hidden!">
              {s.entries.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 rounded-card border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col">
                      <span className={cn("text-body text-text", e.status === "reversed" && "line-through")}>{e.description}</span>
                      <span className="text-caption text-secondary">
                        {formatDate(e.date)} • <span className="num">{e.ref}</span> • <span className="num">{e.contractCode}</span>
                      </span>
                    </div>
                    <span className={cn("text-num-sm num shrink-0", e.debit ? "text-text" : "text-successText")}>
                      {e.debit ? `+${formatAmount(e.debit)}` : `−${formatAmount(e.credit)}`}
                    </span>
                  </div>
                  <div className="text-caption flex flex-wrap items-center justify-between gap-2 text-secondary">
                    <span>
                      {entryTypeLabels[e.type]}
                      {e.method && ` • ${paymentMethodLabels[e.method]}`}
                      {e.status === "reversed" && ` • ${entryStatusLabels.reversed}`}
                    </span>
                    <span>
                      الرصيد: <span className="num text-navy">{formatAmount(e.balance)}</span>
                    </span>
                  </div>
                  {canReverse && e.paymentId && <ReversePaymentButton paymentId={e.paymentId} code={e.ref} amount={e.credit} />}
                </li>
              ))}
              {s.entries.length === 0 && <li className="text-body py-6 text-center text-secondary">لا توجد حركات في هذه الفترة.</li>}
            </ul>
            <p className="text-caption text-secondary">
              المدين: المبالغ المستحقة على العميل (البيع والرسوم وعكس الدفعات). الدائن: ما سدده العميل أو أُعفي منه. الرصيد: المتبقي عليه بعد كل حركة.
            </p>
          </Panel>

          <Panel title="تفاصيل خطط التقسيط">
            {s.plans.map((plan) => (
              <PlanCard key={plan.contractId} plan={plan} filtered={!!f.installments} />
            ))}
          </Panel>
        </>
      )}
    </>
  );
}

function LedgerRow({ e, canReverse }: { e: StatementEntry; canReverse: boolean }) {
  const reversed = e.status === "reversed";
  return (
    <tr className="break-inside-avoid">
      <td className={cn(td, "whitespace-nowrap")}>{formatDate(e.date)}</td>
      <td className={cn(td, "whitespace-nowrap")}>
        <span className="num">{e.ref}</span>
      </td>
      <td className={cn(td, "whitespace-nowrap")}>{entryTypeLabels[e.type]}</td>
      <td className={td}>
        <span className={cn("block", reversed && "text-secondary line-through")}>{e.description}</span>
        <span className="text-caption block text-secondary">
          <span className="num">{e.contractCode}</span> • {e.product}
        </span>
      </td>
      <td className={td}>{amountOrDash(e.debit)}</td>
      <td className={cn(td, "text-successText")}>{amountOrDash(e.credit)}</td>
      <td className={cn(td, "font-medium text-navy")}>{money(e.balance)}</td>
      <td className={td}>
        {e.method ? paymentMethodLabels[e.method] : "—"}
        {e.reference && <span className="num text-caption block text-secondary">{e.reference}</span>}
      </td>
      <td className={td}>
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={reversed ? "warning" : "success"}>{entryStatusLabels[e.status]}</Badge>
          {canReverse && e.paymentId && <ReversePaymentButton paymentId={e.paymentId} code={e.ref} amount={e.credit} />}
        </span>
      </td>
    </tr>
  );
}
