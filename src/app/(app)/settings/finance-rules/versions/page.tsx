import type { Metadata } from "next";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { Badge } from "@/components/ui";
import { formatDate, formatPercent } from "@/lib/format";
import { requirePageUser } from "@/server/auth/dal";
import type { FinanceRule } from "@/server/db/schema";
import { listRuleVersions } from "@/server/finance-rules/service";

export const metadata: Metadata = { title: "سجل إصدارات الخطط · قسط" };

const columns: Column<FinanceRule>[] = [
  {
    key: "name",
    header: "الخطة",
    cell: (r) => (
      <>
        {r.name} • <span className="num">v{r.version}</span>
      </>
    ),
  },
  { key: "rate", header: "السنوي", cell: (r) => formatPercent(r.annualRateBp / 100), numeric: true },
  {
    key: "term",
    header: "المدد",
    cell: (r) => (
      <>
        <span className="num">
          {r.minTermMonths}–{r.maxTermMonths}
        </span>{" "}
        شهرًا
      </>
    ),
  },
  { key: "down", header: "المقدم الأدنى", cell: (r) => formatPercent(r.minDownPaymentBp / 100), numeric: true },
  {
    key: "effective",
    header: "السريان",
    cell: (r) => (
      <>
        {formatDate(r.effectiveFrom)}
        {r.effectiveTo && <> ← {formatDate(r.effectiveTo)}</>}
      </>
    ),
  },
  { key: "reason", header: "سبب التغيير", cell: (r) => r.changeReason || "—" },
  {
    key: "status",
    header: "الحالة",
    cell: (r) =>
      r.isActive ? (
        <Badge status="active" className="min-w-28" />
      ) : (
        <Badge tone="info" className="min-w-28">
          غير نشط
        </Badge>
      ),
  },
];

export default async function RuleVersionsPage({ searchParams }: PageProps<"/settings/finance-rules/versions">) {
  await requirePageUser();
  const { key } = await searchParams;
  const versions = await listRuleVersions(typeof key === "string" ? key : undefined);

  return (
    <>
      <PageHeader
        title="سجل إصدارات الخطط"
        description="كل تعديل يُحفظ كإصدار جديد، والعقود تبقى مرتبطة بإصدارها"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "الإعدادات", href: "/settings" }, { label: "سجل الإصدارات" }]}
      />
      <Panel title="الإصدارات">
        {versions.length ? (
          <DataTable caption="إصدارات خطط التقسيط" columns={columns} rows={versions} rowKey={(r) => r.id} />
        ) : (
          <p className="text-body py-8 text-center text-secondary">لا توجد إصدارات.</p>
        )}
      </Panel>
    </>
  );
}
