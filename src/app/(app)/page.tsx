import Link from "next/link";
import { AgingBars } from "@/components/charts/AgingBars";
import { CollectionChart } from "@/components/charts/CollectionChart";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { RangeForm } from "@/components/page/RangeForm";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import {
  activeContractsLabel,
  CURRENCY,
  customersCountLabel,
  daysCountLabel,
  formatAmount,
  formatDateLong,
  formatDayMonth,
  formatPercent,
  installmentsCountLabel,
  ltr,
} from "@/lib/format";
import { paymentMethodLabels } from "@/lib/payments";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import {
  getDashboard,
  type AgingBand,
  type DashboardPeriod,
  type DueInstallment,
  type FollowUp,
  type RecentReceipt,
} from "@/server/dashboard/service";

const periods: { value: DashboardPeriod; label: string }[] = [
  { value: "month", label: "هذا الشهر" },
  { value: "today", label: "اليوم" },
  { value: "week", label: "هذا الأسبوع" },
  { value: "custom", label: "فترة مخصصة" },
];

const collectedLabels: Record<DashboardPeriod, string> = {
  month: "المحصّل هذا الشهر",
  today: "المحصّل اليوم",
  week: "المحصّل هذا الأسبوع",
  custom: "المحصّل في الفترة",
};

const agingLabels: Record<AgingBand["key"], string> = {
  "1-7": `${ltr("1–7")} أيام`,
  "8-30": `${ltr("8–30")} يومًا`,
  "31-60": `${ltr("31–60")} يومًا`,
  "61-90": `${ltr("61–90")} يومًا`,
  "90+": `أكثر من ${ltr(90)} يومًا`,
};

const whole = (p: number) => formatAmount(p, { whole: true });
const share = (part: number, total: number) => formatPercent(Math.round((part / total) * 1000) / 10);

const customerLink = (code: string, name: string) => (
  <Link href={`/customers/${code}`} className="underline-offset-4 hover:underline">
    {name}
  </Link>
);

const contractLink = (code: string) => (
  <Link href={`/contracts/${code}`} className="num underline-offset-4 hover:underline">
    {code}
  </Link>
);

const dueColumns: Column<DueInstallment>[] = [
  { key: "customer", header: "العميل", cell: (r) => customerLink(r.customerCode, r.customerName) },
  { key: "contract", header: "العقد", cell: (r) => contractLink(r.contractCode) },
  { key: "due", header: "المستحق", cell: (r) => formatAmount(r.amount), numeric: true },
  { key: "remaining", header: "المتبقي", cell: (r) => formatAmount(r.remaining), numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
];

const followUpColumns: Column<FollowUp>[] = [
  { key: "customer", header: "العميل", cell: (r) => customerLink(r.customerCode, r.customerName) },
  {
    key: "reason",
    header: "السبب",
    cell: (r) => `${r.partial ? "سداد جزئي" : "متأخر"} • ${installmentsCountLabel(r.installments)} • منذ ${daysCountLabel(r.daysLate)}`,
  },
  { key: "overdue", header: "المتأخر", cell: (r) => whole(r.overdue), numeric: true },
];

const receiptColumns: Column<RecentReceipt>[] = [
  { key: "customer", header: "العميل", cell: (r) => r.customerName },
  { key: "contract", header: "العقد", cell: (r) => contractLink(r.contractCode) },
  { key: "amount", header: "القيمة", cell: (r) => whole(r.amount), numeric: true },
  { key: "method", header: "الوسيلة", cell: (r) => paymentMethodLabels[r.method] },
  { key: "date", header: "التاريخ", cell: (r) => formatDayMonth(r.date) },
];

function DueCard({ row }: { row: DueInstallment }) {
  return (
    <article className="flex flex-col items-start gap-4 rounded-card border border-border bg-surface p-6">
      <h3 className="text-h4 text-text">{row.customerName}</h3>
      <Badge status={row.status} className="min-w-28" />
      <p className="text-num-sm num text-navy">
        {whole(row.remaining)} {CURRENCY}
      </p>
      <ButtonLink href={`/contracts/${row.contractCode}`} variant="outline" className="w-full">
        عرض العقد
      </ButtonLink>
    </article>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-body py-6 text-center text-secondary">{children}</p>;
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requirePageUser();
  const firstName = user.name.split(/\s+/)[0];
  const sp = await searchParams;
  const period = pickTab(periods, sp.period);
  const data = await getDashboard({ period, from: sp.from, to: sp.to });
  const k = data.kpis;
  const canWrite = can(user.role, "contracts:write");

  const kpis = [
    { label: "المحفظة النشطة", value: k.portfolio, note: activeContractsLabel(k.activeContracts), highlight: true },
    {
      label: collectedLabels[period],
      value: k.periodCollected,
      note: k.periodDue ? `${share(k.periodCollected, k.periodDue)} من مستحقات الفترة` : "لا مستحقات في الفترة",
    },
    {
      label: "الرصيد القائم",
      value: k.outstanding,
      note: k.portfolio ? `${share(k.outstanding, k.portfolio)} من المحفظة` : undefined,
    },
    {
      label: "المبالغ المتأخرة",
      value: k.overdue,
      note: k.overdueCustomers ? `${customersCountLabel(k.overdueCustomers)} • يحتاج المتابعة` : "لا متأخرات",
    },
  ];

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "لوحة التحكم" }]}
        description={
          <>
            <span className="max-lg:hidden">أهلًا {firstName}، إليك ملخص أعمالك اليوم • </span>
            {formatDateLong(data.asOf)}
          </>
        }
        action={
          <ButtonLink href="/installments?tab=today" className="max-lg:w-full lg:w-40">
            أقساط اليوم
          </ButtonLink>
        }
      />

      {canWrite && (
        <div className="hidden flex-wrap gap-3 lg:flex">
          <ButtonLink href="/contracts/new" variant="outline" className="w-40">
            عقد جديد
          </ButtonLink>
          <ButtonLink href="/customers/new" variant="outline" className="w-40">
            إضافة عميل
          </ButtonLink>
        </div>
      )}

      <div className="flex flex-col gap-4 max-lg:hidden">
        <SegmentedTabs items={periods} value={period} param="period" label="الفترة الزمنية" />
        {period === "custom" && <RangeForm range={data.range} keep={{ period }} />}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 desktop:grid-cols-4">
        {kpis.map((kpi, i) => (
          <div key={kpi.label} className={i > 1 ? "max-md:hidden" : undefined}>
            <KpiCard label={kpi.label} value={whole(kpi.value)} note={kpi.note} highlight={kpi.highlight} />
          </div>
        ))}
      </div>

      <div className="grid gap-6 max-md:hidden xl:grid-cols-[minmax(0,1fr)_344px]">
        <Panel title="التحصيل الفعلي مقابل المتوقع">
          <CollectionChart months={data.collections.months} year={data.collections.year} note="المسدّد من مستحقات كل شهر" />
        </Panel>
        <Panel title="أعمار المتأخرات" className="xl:self-start">
          <AgingBars bands={data.aging.map((b) => ({ label: agingLabels[b.key], amount: b.amount }))} />
        </Panel>
      </div>

      <Panel
        title="أقساط اليوم"
        className="max-md:border-0 max-md:bg-transparent max-md:p-0"
        action={
          <Link href="/installments?tab=today" className="text-body text-infoText hover:underline">
            كل الأقساط
          </Link>
        }
      >
        {data.dueToday.length ? (
          <DataTable
            caption="أقساط اليوم"
            columns={dueColumns}
            rows={data.dueToday}
            rowKey={(r) => r.id}
            mobileCard={(r) => <DueCard row={r} />}
          />
        ) : (
          <Empty>لا توجد أقساط مستحقة اليوم.</Empty>
        )}
      </Panel>

      <div className="grid gap-6 max-md:hidden xl:grid-cols-2">
        <Panel
          title="متابعات اليوم"
          action={
            <Link href="/installments?tab=overdue" className="text-body text-infoText hover:underline">
              كل المتأخرات
            </Link>
          }
        >
          {data.followUps.length ? (
            <DataTable caption="متابعات اليوم" columns={followUpColumns} rows={data.followUps} rowKey={(r) => r.customerCode} />
          ) : (
            <Empty>لا يوجد عملاء متأخرون.</Empty>
          )}
        </Panel>
        <Panel title="آخر المدفوعات">
          {data.recentReceipts.length ? (
            <DataTable caption="آخر المدفوعات" columns={receiptColumns} rows={data.recentReceipts} rowKey={(r) => r.id} />
          ) : (
            <Empty>لا توجد مدفوعات مسجّلة بعد.</Empty>
          )}
        </Panel>
      </div>

      <div className="flex max-md:hidden">
        <ButtonLink href="/reports" variant="outline" className="w-52">
          تفاصيل التحليلات
        </ButtonLink>
      </div>
    </>
  );
}
