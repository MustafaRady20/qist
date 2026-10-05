import type { Metadata } from "next";
import Link from "next/link";
import { ActionBar, EmptyState, FilterBar } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery, pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { queryString } from "@/lib/url";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listContracts, type ContractListItem, type ContractTab } from "@/server/contracts/service";
import { pageSchema } from "@/server/validation";

export const metadata: Metadata = { title: "العقود · قسط" };

const tabs: { value: ContractTab; label: string }[] = [
  { value: "active", label: "نشط" },
  { value: "draft", label: "مسودة" },
  { value: "completed", label: "مكتمل" },
  { value: "overdue", label: "متأخر" },
  { value: "settled", label: "تسوية مبكرة" },
  { value: "consolidated", label: "ضمن مجموعة" },
];

const amt = (p: number) => formatAmount(p, { whole: true });

const columns: Column<ContractListItem>[] = [
  {
    key: "code",
    header: "العقد",
    cell: (r) => (
      <Link href={`/contracts/${r.code}`} className="num underline-offset-4 hover:underline">
        {r.code}
      </Link>
    ),
  },
  {
    key: "customer",
    header: "العميل",
    cell: (r) => (
      <Link href={`/customers/${r.customerCode}`} className="underline-offset-4 hover:underline">
        {r.customerName}
      </Link>
    ),
  },
  { key: "purchase", header: "بيانات الشراء", cell: (r) => r.productDescription },
  { key: "principal", header: "الأصل", cell: (r) => amt(r.principal), numeric: true },
  { key: "profit", header: "العائد", cell: (r) => amt(r.profit), numeric: true },
  { key: "outstanding", header: "القائم", cell: (r) => amt(r.outstanding), numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
];

export default async function ContractsPage({ searchParams }: PageProps<"/contracts">) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = pickTab(tabs, sp.tab);
  const q = pickQuery(sp.q);
  const page = pageSchema.parse(sp.page);
  const list = await listContracts({ tab, q, page });
  const canWrite = can(user.role, "contracts:write");

  return (
    <>
      <PageHeader
        title="العقود"
        description="كل عقد يحتفظ بجدوله ورصيده ومدفوعاته بشكل مستقل"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العقود" }]}
        action={
          canWrite && (
            <ButtonLink href="/contracts/new" className="max-lg:w-full lg:w-40">
              إنشاء عقد
            </ButtonLink>
          )
        }
      />
      {list.items[0] && (
        <ActionBar>
          <ButtonLink href={`/contracts/${list.items[0].code}`} variant="outline">
            عرض العقد
          </ButtonLink>
        </ActionBar>
      )}
      <FilterBar placeholder="رقم العقد / اسم العميل" q={q} keep={{ tab }} />
      <SegmentedTabs items={tabs} value={tab} param="tab" label="حالة العقد" keep={{ q }} />
      <Panel title="سجل العقود">
        {list.items.length ? (
          <DataTable caption="سجل العقود" columns={columns} rows={list.items} rowKey={(r) => r.id} />
        ) : q || tab !== "active" ? (
          <EmptyState
            icon="search"
            title="لا توجد نتائج مطابقة"
            action={
              <ButtonLink href="/contracts" variant="outline" className="w-full md:w-65">
                مسح الفلاتر
              </ButtonLink>
            }
          >
            جرّب رقم العقد أو اسم العميل، أو اختر حالة أخرى.
          </EmptyState>
        ) : (
          <EmptyState
            icon="contracts"
            title="لا توجد عقود"
            action={
              canWrite && (
                <ButtonLink href="/contracts/new" className="w-full md:w-65">
                  إنشاء عقد
                </ButtonLink>
              )
            }
          >
            ابدأ عقدًا لعميل جديد أو موجود.
          </EmptyState>
        )}
        <Pagination
          total={list.total}
          page={list.page}
          pageCount={list.pageCount}
          hrefFor={(p) => queryString({ tab, q, page: p })}
        />
      </Panel>
    </>
  );
}
