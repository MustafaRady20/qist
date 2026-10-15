import type { Metadata } from "next";
import { DetailList, EmptyState, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { pickQuery } from "@/components/page/SegmentedTabs";
import { Badge, Button, ButtonLink, TextField } from "@/components/ui";
import { formatAmount, formatDate } from "@/lib/format";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listContracts, type ContractListItem } from "@/server/contracts/service";
import { todayInCairo } from "@/server/time";
import { loadContract } from "../../contracts/load";
import { PaymentForm } from "./PaymentForm";

export const metadata: Metadata = { title: "تسجيل دفعة · قسط" };

const money = (p: number) => <span className="num">{formatAmount(p)}</span>;
const crumbs = [{ label: "الرئيسية", href: "/" }, { label: "المدفوعات", href: "/payments" }, { label: "تسجيل دفعة" }];

const columns: Column<ContractListItem>[] = [
  { key: "code", header: "العقد", cell: (r) => r.code, numeric: true },
  { key: "customer", header: "العميل", cell: (r) => r.customerName },
  { key: "product", header: "المنتج", cell: (r) => r.productDescription },
  { key: "outstanding", header: "المتبقي", cell: (r) => formatAmount(r.outstanding), numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
  {
    key: "pick",
    header: "",
    cell: (r) => (
      <ButtonLink href={`/payments/new?contract=${r.code}`} variant="outline" className="h-10 w-32">
        تسجيل دفعة
      </ButtonLink>
    ),
  },
];

export default async function NewPaymentPage({ searchParams }: PageProps<"/payments/new">) {
  const user = await requirePageUser();
  if (!can(user.role, "payments:write")) return <Forbidden />;
  const sp = await searchParams;
  const contractCode = pickQuery(sp.contract);

  // Step 1: pick the contract (searching by contract, customer or product).
  if (!contractCode) {
    const q = pickQuery(sp.q) ?? pickQuery(sp.customer);
    const { items } = await listContracts({ q });
    const open = items.filter((c) => c.status === "active" || c.status === "overdue");
    return (
      <>
        <PageHeader title="تسجيل دفعة" description="اختر العقد الذي تُسجَّل عليه الدفعة" breadcrumbs={crumbs} />
        <form role="search" className="flex flex-col gap-3 md:flex-row md:items-center">
          <TextField kind="search" name="q" label="بحث عن عقد" placeholder="رقم العقد / العميل / المنتج" defaultValue={q} className="md:flex-1" />
          <Button type="submit" className="md:w-32">
            بحث
          </Button>
        </form>
        <Panel title="العقود النشطة">
          {open.length ? (
            <DataTable caption="العقود النشطة" columns={columns} rows={open} rowKey={(r) => r.id} />
          ) : (
            <EmptyState icon="search" title="لا توجد عقود نشطة مطابقة">
              الدفعات تُسجَّل على العقود النشطة فقط. جرّب رقم العقد أو اسم العميل.
            </EmptyState>
          )}
        </Panel>
      </>
    );
  }

  // Step 2: the payment itself.
  const c = await loadContract(contractCode);
  const open = c.status === "active" || c.status === "overdue";
  const next = c.installments.find((i) => i.remaining > 0);

  return (
    <>
      <PageHeader
        title="تسجيل دفعة"
        description={
          <>
            <span className="num">{c.code}</span> • {c.customer.fullName} • {c.productDescription}
          </>
        }
        breadcrumbs={crumbs}
      />
      {!open || !next ? (
        <>
          <Notice tone="warning">تسجيل الدفعات متاح للعقود النشطة التي عليها رصيد فقط.</Notice>
          <div>
            <ButtonLink href={`/contracts/${c.code}`} variant="outline" className="w-40">
              رجوع للعقد
            </ButtonLink>
          </div>
        </>
      ) : (
        <>
          <Panel title="رصيد العقد">
            <DetailList
              items={[
                { label: "المتبقي على العقد", value: money(c.balances.outstanding) },
                { label: "المتأخر", value: <span className={c.balances.overdue > 0 ? "text-dangerText" : undefined}>{money(c.balances.overdue)}</span> },
                {
                  label: "القسط التالي",
                  value: (
                    <>
                      القسط <span className="num">{next.seq}</span> • {formatDate(next.dueDate)} • {money(next.remaining)}
                    </>
                  ),
                },
              ]}
            />
          </Panel>
          <PaymentForm
            contractCode={c.code}
            customerCode={c.customer.code}
            outstanding={c.balances.outstanding}
            suggested={next.remaining}
            today={todayInCairo()}
            minDate={todayInCairo(c.confirmedAt ?? c.createdAt)}
          />
        </>
      )}
    </>
  );
}
