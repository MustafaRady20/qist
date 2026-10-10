import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { formatAmount, formatDate } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/payments";
import { queryString } from "@/lib/url";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listPayments, type PaymentListItem } from "@/server/payments/service";
import { pageSchema } from "@/server/validation";

export const metadata: Metadata = { title: "المدفوعات · قسط" };

const columns: Column<PaymentListItem>[] = [
  { key: "ref", header: "المرجع", cell: (r) => r.code, numeric: true },
  {
    key: "customer",
    header: "العميل",
    cell: (r) => (
      <Link href={`/customers/${r.customerCode}/statement`} className="underline-offset-4 hover:underline">
        {r.customerName}
      </Link>
    ),
  },
  {
    key: "contract",
    header: "العقد",
    cell: (r) => (
      <Link href={`/contracts/${r.contractCode}`} className="underline-offset-4 hover:underline">
        {r.contractCode}
      </Link>
    ),
    numeric: true,
  },
  { key: "date", header: "التاريخ", cell: (r) => formatDate(r.paidOn) },
  { key: "amount", header: "المبلغ", cell: (r) => `${r.kind === "reversal" ? "−" : ""}${formatAmount(r.amount)}`, numeric: true },
  { key: "method", header: "الوسيلة", cell: (r) => paymentMethodLabels[r.method] },
  {
    key: "status",
    header: "الحالة",
    cell: (r) =>
      r.kind === "reversal" ? (
        <Badge tone="danger">قيد عكسي</Badge>
      ) : r.reversed ? (
        <Badge tone="warning">معكوسة</Badge>
      ) : (
        <Badge tone="success">مُرحّلة</Badge>
      ),
  },
];

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const q = pickQuery(sp.q);
  const list = await listPayments({ q, page: pageSchema.parse(sp.page) });

  return (
    <>
      <PageHeader
        title="المدفوعات"
        description="معاملة واحدة، وتوزيع موثّق على الأقساط والعقود"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "المدفوعات" }]}
        action={
          can(user.role, "payments:write") && (
            <ButtonLink href="/payments/new" className="max-lg:w-full lg:w-40">
              تسجيل دفعة
            </ButtonLink>
          )
        }
      />
      <FilterBar placeholder="مرجع الدفع / العقد / العميل" q={q} />
      <Panel title="سجل المدفوعات">
        {list.items.length ? (
          <DataTable caption="سجل المدفوعات" columns={columns} rows={list.items} rowKey={(r) => r.id} />
        ) : (
          <EmptyState icon="wallet" title={q ? "لا توجد نتائج مطابقة" : "لا توجد مدفوعات مسجلة"}>
            {q ? "جرّب مرجع الدفعة أو رقم العقد أو اسم العميل." : "سجّل أول دفعة من صفحة العقد أو من زر «تسجيل دفعة»."}
          </EmptyState>
        )}
        <Pagination total={list.total} page={list.page} pageCount={list.pageCount} hrefFor={(p) => queryString({ q, page: p })} />
      </Panel>
    </>
  );
}
