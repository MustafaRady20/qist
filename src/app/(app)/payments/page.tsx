import type { Metadata } from "next";
import { ActionBar, FilterBar } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery } from "@/components/page/SegmentedTabs";
import { ButtonLink } from "@/components/ui";
import { listPayments, type PaymentRow } from "@/data/payments";
import { formatAmount, formatDayMonth } from "@/lib/format";

export const metadata: Metadata = { title: "المدفوعات · قسط" };

const amt = (p: number) => formatAmount(p, { whole: true });

const columns: Column<PaymentRow>[] = [
  { key: "ref", header: "المرجع", cell: (r) => r.ref, numeric: true },
  { key: "customer", header: "العميل", cell: (r) => r.customer },
  { key: "date", header: "التاريخ", cell: (r) => formatDayMonth(r.date) },
  { key: "received", header: "المستلم", cell: (r) => amt(r.received), numeric: true },
  { key: "applied", header: "المطبّق", cell: (r) => amt(r.applied), numeric: true },
  { key: "credit", header: "رصيد دائن", cell: (r) => amt(r.credit), numeric: true },
  { key: "method", header: "الوسيلة", cell: (r) => r.method },
];

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const q = pickQuery((await searchParams).q);
  const rows = await listPayments({ q });

  return (
    <>
      <PageHeader
        title="المدفوعات"
        description="معاملة واحدة، وتوزيع موثّق على الأقساط والعقود"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "المدفوعات" }]}
        action={
          <ButtonLink href="/payments/new" className="max-lg:w-full lg:w-40">
            تسجيل دفعة
          </ButtonLink>
        }
      />
      <ActionBar>
        <ButtonLink href="/payments/credit" variant="outline">
          رصيد العميل
        </ButtonLink>
        <ButtonLink href="/payments/allocate" variant="outline">
          دفع عدة أقساط
        </ButtonLink>
      </ActionBar>
      <FilterBar placeholder="مرجع الدفع / العميل" q={q} />
      <Panel title="سجل المدفوعات">
        <DataTable caption="سجل المدفوعات" columns={columns} rows={rows} rowKey={(r) => r.ref} />
        <Pagination total={rows.length} />
      </Panel>
    </>
  );
}
