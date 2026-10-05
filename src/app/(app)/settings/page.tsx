import type { Metadata } from "next";
import { ActionBar, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { settingsTabs } from "@/data/admin";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import type { FinanceRule } from "@/server/db/schema";
import { listFinanceRules } from "@/server/finance-rules/service";
import { formatDate, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "الإعدادات · قسط" };

const columns: Column<FinanceRule>[] = [
  {
    key: "name",
    header: "القاعدة",
    cell: (r) => (
      <>
        {r.name} • <span className="num">v{r.version}</span>
      </>
    ),
  },
  { key: "rate", header: "السنوي", cell: (r) => formatPercent(r.annualRateBp / 100), numeric: true },
  { key: "method", header: "الطريقة", cell: () => "Flat", numeric: true },
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
  { key: "from", header: "السريان", cell: (r) => formatDate(r.effectiveFrom) },
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

const sections: Record<string, string> = {
  settlement: "سياسة التسوية المبكرة",
  general: "الإعدادات العامة",
  whatsapp: "إعدادات واتساب",
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requirePageUser();
  const tab = pickTab(settingsTabs, (await searchParams).tab);
  const rules = await listFinanceRules();
  const canEdit = can(user.role, "finance-rules:write");

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="قواعد مرنة مع الاحتفاظ بتاريخ الإصدارات"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "الإعدادات" }]}
        action={
          canEdit && (
            <ButtonLink href="/settings/finance-rules/new" className="max-lg:w-full lg:w-40">
              قاعدة تمويل جديدة
            </ButtonLink>
          )
        }
      />
      <SegmentedTabs items={settingsTabs} value={tab} param="tab" label="أقسام الإعدادات" />
      {tab === "finance" ? (
        <>
          <ActionBar>
            <ButtonLink href="/settings/settlement-policy" variant="outline">
              سياسة التسوية
            </ButtonLink>
            <ButtonLink href="/settings/finance-rules/versions" variant="outline">
              سجل الإصدارات
            </ButtonLink>
          </ActionBar>
          <Panel title="قواعد التمويل">
            <DataTable caption="قواعد التمويل" columns={columns} rows={rules} rowKey={(r) => r.id} />
            <Pagination total={rules.length} />
          </Panel>
          <Notice>
            <span className="num">40%</span> قيمة مثال قابلة للتغيير. العقود القائمة تظل مرتبطة بإصدارها الأصلي دون إعادة
            حساب تلقائي.
          </Notice>
        </>
      ) : (
        <Panel title={sections[tab]}>
          <p className="text-body text-secondary">لا يوجد تصميم لهذا القسم بعد.</p>
        </Panel>
      )}
    </>
  );
}
