import type { Metadata } from "next";
import { ActionBar } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { ButtonLink } from "@/components/ui";
import { agingTabs, getOverdueSummary, listOverdue, type OverdueRow } from "@/data/collections";
import { formatAmount, formatDayMonth } from "@/lib/format";

export const metadata: Metadata = { title: "العملاء المتأخرون · قسط" };

const amt = (p: number) => formatAmount(p, { whole: true });

const columns: Column<OverdueRow>[] = [
  { key: "customer", header: "العميل", cell: (r) => r.customer },
  { key: "overdue", header: "المتأخر", cell: (r) => amt(r.overdue), numeric: true },
  { key: "days", header: "الأيام", cell: (r) => r.daysLate, numeric: true },
  { key: "contact", header: "آخر تواصل", cell: (r) => formatDayMonth(r.lastContact) },
  { key: "promise", header: "الوعد", cell: (r) => ("date" in r.promise ? formatDayMonth(r.promise.date) : r.promise.label) },
  { key: "next", header: "المتابعة القادمة", cell: (r) => r.nextFollowUp },
];

export default async function OverduePage({ searchParams }: PageProps<"/overdue">) {
  const tab = pickTab(agingTabs, (await searchParams).tab);
  const [summary, rows] = await Promise.all([getOverdueSummary(), listOverdue({ tab })]);

  return (
    <>
      <PageHeader
        title="العملاء المتأخرون"
        description={
          <>
            <span className="num">{summary.customers}</span> عميلًا • إجمالي متأخرات{" "}
            <span className="num">{amt(summary.total)}</span> جنيه
          </>
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العملاء المتأخرون" }]}
        action={
          <ButtonLink href="/collections?tab=overdue" className="max-lg:w-full lg:w-40">
            بدء المتابعة
          </ButtonLink>
        }
      />
      <SegmentedTabs items={agingTabs} value={tab} param="tab" label="مدة التأخير" />
      <Panel title="أولوية المتابعة">
        <DataTable caption="أولوية المتابعة" columns={columns} rows={rows} rowKey={(r) => r.customer} />
        <Pagination total={rows.length} />
      </Panel>
      <ActionBar>
        <ButtonLink href="/whatsapp" variant="whatsapp">
          إرسال تذكير
        </ButtonLink>
      </ActionBar>
    </>
  );
}
