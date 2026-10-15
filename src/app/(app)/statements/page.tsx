import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery } from "@/components/page/SegmentedTabs";
import { Badge, Button, ButtonLink, TextField } from "@/components/ui";
import { formatAmount, formatPhone } from "@/lib/format";
import { queryString } from "@/lib/url";
import { listCustomers, type CustomerListItem } from "@/server/customers/service";
import { pageSchema } from "@/server/validation";

export const metadata: Metadata = { title: "كشف الحساب · قسط" };

const amt = (p: number) => formatAmount(p, { whole: true });

const columns: Column<CustomerListItem>[] = [
  {
    key: "name",
    header: "العميل / الهاتف",
    cell: (r) => (
      <span className="flex flex-col">
        <Link href={`/customers/${r.code}/statement`} className="underline-offset-4 hover:underline">
          {r.fullName}
        </Link>
        <span className="num text-right text-text">{formatPhone(r.phone)}</span>
      </span>
    ),
  },
  { key: "code", header: "الرقم", cell: (r) => r.code, numeric: true },
  { key: "outstanding", header: "الرصيد المستحق", cell: (r) => amt(r.outstanding), numeric: true },
  {
    key: "overdue",
    header: "المتأخر",
    cell: (r) => (r.overdue > 0 ? <Badge tone="danger">{amt(r.overdue)}</Badge> : amt(0)),
    numeric: true,
  },
  {
    key: "open",
    header: "",
    cell: (r) => (
      <ButtonLink href={`/customers/${r.code}/statement`} variant="outline" className="h-10 w-32">
        عرض الكشف
      </ButtonLink>
    ),
  },
];

/** Customer picker for the account statement: search by name, phone, customer number or national ID. */
export default async function StatementsPage({ searchParams }: PageProps<"/statements">) {
  const sp = await searchParams;
  const q = pickQuery(sp.q);
  const list = await listCustomers({ q, page: pageSchema.parse(sp.page) });

  return (
    <>
      <PageHeader
        title="كشف الحساب"
        description="اختر العميل لعرض كشف حسابه وطباعته أو تحميله"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "كشف الحساب" }]}
      />
      <form role="search" className="flex flex-col gap-3 md:flex-row md:items-center">
        <TextField kind="search" name="q" label="بحث عن عميل" placeholder="الاسم / الهاتف / رقم العميل" defaultValue={q} className="md:flex-1" />
        <Button type="submit" className="md:w-32">
          بحث
        </Button>
      </form>
      <Panel title="العملاء">
        {list.items.length ? (
          <DataTable caption="اختيار عميل لكشف الحساب" columns={columns} rows={list.items} rowKey={(r) => r.id} />
        ) : q ? (
          <EmptyState
            icon="search"
            title="لا توجد نتائج مطابقة"
            action={
              <ButtonLink href="/statements" variant="outline" className="w-full md:w-65">
                مسح البحث
              </ButtonLink>
            }
          >
            جرّب الاسم أو رقم الهاتف أو رقم العميل.
          </EmptyState>
        ) : (
          <EmptyState icon="customers" title="لا يوجد عملاء بعد">
            أضف عميلًا وأنشئ له عقدًا ليظهر كشف حسابه هنا.
          </EmptyState>
        )}
        <Pagination total={list.total} page={list.page} pageCount={list.pageCount} hrefFor={(p) => queryString({ q, page: p })} />
      </Panel>
    </>
  );
}
