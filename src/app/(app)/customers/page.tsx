import type { Metadata } from "next";
import Link from "next/link";
import { ActionBar, EmptyState, FilterBar, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery, pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { formatAmount, formatDayMonth } from "@/lib/format";
import { queryString } from "@/lib/url";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import {
  getCustomerSummary,
  listCustomers,
  type CustomerListItem,
  type CustomerTab,
} from "@/server/customers/service";
import { pageSchema } from "@/server/validation";

export const metadata: Metadata = { title: "العملاء · قسط" };

const tabs: { value: CustomerTab; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "active", label: "نشط" },
  { value: "noBalance", label: "بدون رصيد" },
  { value: "overdue", label: "متأخر" },
  { value: "multi", label: "عقود متعددة" },
  { value: "new", label: "مضاف حديثًا" },
];

const amt = (p: number) => formatAmount(p, { whole: true });
const count = new Intl.NumberFormat("en-US");

const columns: Column<CustomerListItem>[] = [
  {
    key: "name",
    header: "العميل / الهاتف",
    cell: (r) => (
      <span className="flex flex-col">
        <Link href={`/customers/${r.code}`} className="underline-offset-4 hover:underline">
          {r.fullName}
        </Link>
        <span className="num text-right text-text">{r.phone}</span>
      </span>
    ),
  },
  { key: "code", header: "الرقم", cell: (r) => r.code, numeric: true },
  { key: "contracts", header: "العقود", cell: (r) => r.activeContracts, numeric: true },
  { key: "financed", header: "المموّل", cell: (r) => amt(r.financed), numeric: true },
  { key: "paid", header: "المدفوع", cell: (r) => amt(r.paid), numeric: true },
  { key: "outstanding", header: "القائم", cell: (r) => amt(r.outstanding), numeric: true },
  { key: "overdue", header: "المتأخر", cell: (r) => amt(r.overdue), numeric: true },
  { key: "next", header: "التالي", cell: (r) => (r.nextDue ? formatDayMonth(r.nextDue) : "—") },
  {
    key: "status",
    header: "الحالة",
    cell: (r) =>
      r.status === "noBalance" ? (
        <Badge tone="success" className="min-w-28">
          بدون رصيد
        </Badge>
      ) : (
        <Badge status={r.status} className="min-w-28" />
      ),
  },
];

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = pickTab(tabs, sp.tab);
  const q = pickQuery(sp.q);
  const page = pageSchema.parse(sp.page);
  const [summary, list] = await Promise.all([getCustomerSummary(), listCustomers({ tab, q, page })]);
  const canWrite = can(user.role, "customers:write");

  return (
    <>
      <PageHeader
        title="العملاء"
        description="سجل دائم لكل عميل، وكل عقد، وكل دفعة"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العملاء" }]}
        action={
          canWrite && (
            <ButtonLink href="/customers/new" className="max-lg:w-full lg:w-40">
              إضافة عميل
            </ButtonLink>
          )
        }
      />
      {list.items[0] && (
        <ActionBar>
          <ButtonLink href={`/customers/${list.items[0].code}`} variant="outline">
            فتح ملف العميل
          </ButtonLink>
        </ActionBar>
      )}
      <KpiGrid>
        <KpiCard label="كل العملاء" value={count.format(summary.total)} note="سجل دائم" />
        <KpiCard label="عملاء نشطون" value={count.format(summary.active)} note="لديهم عقود" />
        <KpiCard label="بدون رصيد حالي" value={count.format(summary.noBalance)} note="يمكنهم العودة بعقد جديد" />
        <KpiCard label="عملاء متأخرون" value={count.format(summary.overdue)} note="تحتاج متابعة" />
      </KpiGrid>
      <SegmentedTabs items={tabs} value={tab} param="tab" label="تصنيف العملاء" keep={{ q }} />
      <FilterBar placeholder="الاسم / الهاتف / رقم الهوية" q={q} keep={{ tab }} />
      <Panel title="دليل العملاء">
        {list.items.length ? (
          <DataTable caption="دليل العملاء" columns={columns} rows={list.items} rowKey={(r) => r.id} />
        ) : summary.total === 0 ? (
          <EmptyState
            icon="customers"
            title="لا يوجد عملاء بعد"
            action={
              canWrite && (
                <ButtonLink href="/customers/new" className="w-full md:w-65">
                  إضافة عميل
                </ButtonLink>
              )
            }
          >
            أضف أول عميل لبدء إنشاء العقود.
          </EmptyState>
        ) : (
          <EmptyState
            icon="search"
            title="لا توجد نتائج مطابقة"
            action={
              <ButtonLink href="/customers" variant="outline" className="w-full md:w-65">
                مسح الفلاتر
              </ButtonLink>
            }
          >
            جرّب الاسم أو رقم الهاتف وأزل بعض الفلاتر.
          </EmptyState>
        )}
        <Pagination
          total={list.total}
          page={list.page}
          pageCount={list.pageCount}
          hrefFor={(p) => queryString({ tab, q, page: p })}
        />
      </Panel>
      <Notice>العملاء المكتملون يظلون محفوظين. افتح الملف نفسه عند عودتهم ثم أنشئ عقدًا جديدًا.</Notice>
    </>
  );
}
