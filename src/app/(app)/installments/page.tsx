import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar, InfoCard, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery, pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { formatAmount, formatDate, formatDayMonth, installmentsCountLabel } from "@/lib/format";
import { queryString } from "@/lib/url";
import { requirePageUser } from "@/server/auth/dal";
import {
  getInstallmentSummary,
  listInstallments,
  UPCOMING_DAYS,
  type InstallmentBucket,
  type InstallmentListItem,
  type InstallmentTab,
} from "@/server/installments/service";
import { pageSchema } from "@/server/validation";

export const metadata: Metadata = { title: "الأقساط · قسط" };

const tabs: { value: InstallmentTab; label: string }[] = [
  { value: "all", label: "كل الأقساط" },
  { value: "today", label: "اليوم" },
  { value: "overdue", label: "متأخر" },
  { value: "upcoming", label: "قادم" },
  { value: "partial", label: "جزئي" },
  { value: "paid", label: "مدفوع" },
];

const amt = (p: number) => formatAmount(p, { whole: true });

const columns: Column<InstallmentListItem>[] = [
  {
    key: "customer",
    header: "العميل / القسط",
    cell: (r) => (
      <>
        <Link href={`/customers/${r.customerCode}`} className="underline-offset-4 hover:underline">
          {r.customerName}
        </Link>{" "}
        • <span className="num">{r.seq}</span>
      </>
    ),
  },
  {
    key: "contract",
    header: "العقد",
    cell: (r) => (
      <Link href={`/contracts/${r.contractCode}?tab=schedule`} className="num underline-offset-4 hover:underline">
        {r.contractCode}
      </Link>
    ),
  },
  { key: "purchase", header: "المشتريات", cell: (r) => <span className="line-clamp-2 max-w-48">{r.productDescription}</span> },
  { key: "due", header: "الاستحقاق", cell: (r) => formatDate(r.dueDate) },
  { key: "amount", header: "قيمة القسط", cell: (r) => amt(r.amount), numeric: true },
  { key: "paid", header: "المسدّد منه", cell: (r) => amt(r.paid), numeric: true },
  { key: "remaining", header: "متبقي القسط", cell: (r) => amt(r.remaining), numeric: true },
  { key: "late", header: "أيام التأخير", cell: (r) => r.daysLate, numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
];

function bucketNote(b: InstallmentBucket, suffix: string) {
  return b.count ? `${installmentsCountLabel(b.count)} • ${suffix}` : "لا أقساط";
}

export default async function InstallmentsPage({ searchParams }: PageProps<"/installments">) {
  await requirePageUser();
  const sp = await searchParams;
  const tab = pickTab(tabs, sp.tab);
  const q = pickQuery(sp.q);
  const page = pageSchema.parse(sp.page);
  const [summary, list] = await Promise.all([getInstallmentSummary(), listInstallments({ tab, q, page })]);
  const tabLabel = tab === "all" ? "الأقساط غير المسدّدة" : tabs.find((t) => t.value === tab)!.label;

  return (
    <>
      <PageHeader
        title="الأقساط"
        description="كل صف قسط واحد: العميل، العقد، الميعاد، المطلوب، المسدّد والمتبقي من القسط."
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "الأقساط" }]}
        action={
          <ButtonLink href="/reports/expected-collection" variant="outline" className="max-lg:w-full lg:w-40">
            التحصيل المتوقع
          </ButtonLink>
        }
      />
      <KpiGrid>
        <KpiCard label="مطلوب اليوم" value={amt(summary.today.amount)} note={bucketNote(summary.today, formatDayMonth(summary.asOf))} />
        <KpiCard label="متأخر" value={amt(summary.overdue.amount)} note={bucketNote(summary.overdue, "يشمل المتبقي من الجزئي")} />
        <KpiCard label="قادم" value={amt(summary.upcoming.amount)} note={bucketNote(summary.upcoming, `خلال ${UPCOMING_DAYS} يومًا`)} />
      </KpiGrid>
      <InfoCard title="الأقساط • ماذا يستحق ومتى؟">
        المتبقي هنا يخص القسط فقط، وليس رصيد العقد. نفس العميل قد يكون له أكثر من قسط في نفس اليوم.
      </InfoCard>
      <SegmentedTabs items={tabs} value={tab} param="tab" label="حالة القسط" keep={{ q }} />
      <FilterBar placeholder="اسم العميل / رقم العقد / المشتريات" q={q} keep={{ tab }} />
      <Panel
        title={
          <>
            {tabLabel} • <span className="num">{list.total}</span> {list.total === 1 ? "نتيجة" : "نتائج"}
          </>
        }
      >
        {list.items.length ? (
          <DataTable caption={tabLabel} columns={columns} rows={list.items} rowKey={(r) => r.id} />
        ) : (
          <EmptyState
            icon={q ? "search" : "calendar"}
            title={q ? "لا توجد نتائج مطابقة" : "لا توجد أقساط في هذا القسم"}
            action={
              (q || tab !== "all") && (
                <ButtonLink href="/installments" variant="outline" className="w-full md:w-65">
                  مسح الفلاتر
                </ButtonLink>
              )
            }
          >
            {q ? "جرّب اسم العميل أو رقم العقد، أو اختر حالة أخرى." : "تظهر الأقساط هنا بعد تأكيد العقود."}
          </EmptyState>
        )}
        <Pagination total={list.total} page={list.page} pageCount={list.pageCount} hrefFor={(p) => queryString({ tab, q, page: p })} />
      </Panel>
      <Notice>كل صف يمثل قسطًا لعقد محدد. يمكن أن يستحق أكثر من قسط للعميل في نفس اليوم.</Notice>
    </>
  );
}
