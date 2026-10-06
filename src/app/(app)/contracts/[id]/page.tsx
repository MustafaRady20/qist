import type { Metadata } from "next";
import Link from "next/link";
import { ActionBar, DetailList, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { formatAmount, formatDate, formatPercent, installmentsCountLabel } from "@/lib/format";
import { profitBaseLabels } from "@/lib/installments";
import { paymentMethodLabels } from "@/lib/payments";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listContractActivity, type ContractDetail } from "@/server/contracts/service";
import { loadContract } from "../load";
import { DraftActions } from "./DraftActions";

export const metadata: Metadata = { title: "تفاصيل العقد · قسط" };

const tabs = [
  { value: "overview", label: "نظرة عامة" },
  { value: "schedule", label: "الجدول" },
  { value: "activity", label: "سجل النشاط" },
] as const;

type Row = ContractDetail["installments"][number];
const money = (p: number) => formatAmount(p);
const whole = (p: number) => formatAmount(p, { whole: true });
const num = (text: string) => <span className="num">{text}</span>;

const summaryColumns: Column<Row>[] = [
  { key: "seq", header: "#", cell: (r) => r.seq, numeric: true },
  { key: "due", header: "الاستحقاق", cell: (r) => formatDate(r.dueDate) },
  { key: "amount", header: "المبلغ", cell: (r) => money(r.amount), numeric: true },
  { key: "paid", header: "المدفوع", cell: (r) => money(r.paidAmount), numeric: true },
  { key: "remaining", header: "المتبقي", cell: (r) => money(r.remaining), numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
];

const scheduleColumns: Column<Row>[] = [
  ...summaryColumns.slice(0, 2),
  { key: "principal", header: "الأصل", cell: (r) => money(r.principal), numeric: true },
  { key: "profit", header: "العائد", cell: (r) => money(r.profit), numeric: true },
  ...summaryColumns.slice(2),
];

/** The installments around the next one to pay: the one before it, itself and the one after. */
function currentWindow(rows: Row[]) {
  const next = rows.findIndex((r) => r.remaining > 0);
  if (next === -1) return rows.slice(-3);
  const start = Math.max(0, Math.min(next - 1, rows.length - 3));
  return rows.slice(start, start + 3);
}

export default async function ContractDetailPage({ params, searchParams }: PageProps<"/contracts/[id]">) {
  const user = await requirePageUser();
  const c = await loadContract((await params).id);
  const tab = pickTab([...tabs], (await searchParams).tab);
  const activity = await listContractActivity(c.id);

  const canWrite = can(user.role, "contracts:write");
  const open = c.status === "active" || c.status === "overdue";
  const draft = c.status === "draft";
  const rate = formatPercent(c.annualRateBp / 100);

  return (
    <>
      <PageHeader
        title={`العقد ${c.code}`}
        description={
          <>
            {c.customer.fullName} • {c.productDescription}
            {c.confirmedAt && <> • بدأ {formatDate(c.confirmedAt)}</>}
          </>
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العقود", href: "/contracts" }, { label: `العقد ${c.code}` }]}
      />

      <div className="flex flex-wrap gap-3">
        <Badge status={c.status} />
        {c.group && (
          <Link href={`/contracts/groups/${c.group.id}`}>
            <Badge tone="info">ضمن مجموعة: {c.group.name}</Badge>
          </Link>
        )}
      </div>

      <ActionBar>
        <ButtonLink href={`/customers/${c.customer.code}`} variant="outline">
          ملف العميل
        </ButtonLink>
        {open && canWrite && !c.group && (
          <ButtonLink href={`/contracts/consolidate?customer=${c.customer.code}`} variant="outline">
            تجميع عقود العميل
          </ButtonLink>
        )}
        {open && can(user.role, "contracts:settle") && (
          <ButtonLink href={`/contracts/${c.code}/settlement`} variant="outline">
            تسوية مبكرة
          </ButtonLink>
        )}
        {draft && canWrite && (
          <>
            <ButtonLink href={`/contracts/${c.code}/edit`} variant="outline">
              متابعة التعديل
            </ButtonLink>
            <DraftActions code={c.code} canConfirm={can(user.role, "contracts:confirm")} />
          </>
        )}
      </ActionBar>

      {draft && <Notice tone="warning">هذا العقد مسودة: لم تُنشأ أقساطه بعد ولا يُحتسب في أرصدة العميل حتى تأكيده.</Notice>}

      <KpiGrid>
        <KpiCard label="أصل التمويل" value={whole(c.principal)} note={<>قاعدة {num(rate)} • الإصدار {num(String(c.rule.version))}</>} />
        <KpiCard label="عائد التمويل" value={whole(c.profit)} note={<>رسوم: {num(money(c.fees))}</>} />
        {draft || c.status === "cancelled" ? (
          <KpiCard label="إجمالي الأقساط" value={whole(c.totalInstallments)} note={installmentsCountLabel(c.installmentCount)} />
        ) : (
          <>
            <KpiCard label="المدفوع" value={whole(c.balances.paid)} note={<>إجمالي العقد: {num(whole(c.totalInstallments))}</>} />
            <KpiCard label="القائم" value={whole(c.balances.outstanding)} note={<>المتأخر: {num(money(c.balances.overdue))}</>} />
          </>
        )}
      </KpiGrid>

      <SegmentedTabs items={[...tabs]} value={tab} param="tab" label="أقسام العقد" />

      {tab !== "activity" && (
        <Panel title={tab === "schedule" ? `جدول الأقساط • ${installmentsCountLabel(c.installmentCount)}` : "الأقساط"}>
          {c.installments.length ? (
            tab === "schedule" ? (
              <>
                <DataTable caption="جدول الأقساط" columns={scheduleColumns} rows={c.installments} rowKey={(r) => r.id} />
                <Pagination total={c.installments.length} />
              </>
            ) : (
              <>
                <DataTable caption="الأقساط الحالية" columns={summaryColumns} rows={currentWindow(c.installments)} rowKey={(r) => r.id} />
                <p className="text-caption text-secondary">
                  القسط الحالي وما حوله.{" "}
                  <Link href="?tab=schedule" scroll={false} className="text-infoText hover:underline">
                    عرض الجدول الكامل
                  </Link>
                </p>
              </>
            )
          ) : (
            <p className="text-body py-8 text-center text-secondary">
              {draft ? "يُنشأ جدول الأقساط عند تأكيد العقد." : "لم يُنشأ جدول أقساط لهذا العقد."}
            </p>
          )}
        </Panel>
      )}

      {tab === "overview" && c.settlement && (
        <Panel title="التسوية المبكرة">
          <DetailList
            items={[
              { label: "تاريخ التسوية", value: formatDate(c.settlement.settledOn) },
              { label: "المبلغ المستلم", value: num(money(c.settlement.amount)) },
              { label: "العائد المستقبلي المعفى", value: num(money(c.settlement.waivedProfit)) },
              {
                label: "وسيلة الدفع",
                value: (
                  <>
                    {paymentMethodLabels[c.settlement.paymentMethod]}
                    {c.settlement.paymentReference && <> • {num(c.settlement.paymentReference)}</>}
                  </>
                ),
              },
              { label: "السياسة", value: c.settlement.policy },
              { label: "السبب", value: c.settlement.reason },
            ]}
          />
        </Panel>
      )}

      {tab === "overview" && (
        <Panel title="بيانات العقد">
          <DetailList
            items={[
              {
                label: "العميل",
                value: (
                  <Link href={`/customers/${c.customer.code}`} className="hover:underline">
                    {c.customer.fullName} • {num(c.customer.code)}
                  </Link>
                ),
              },
              { label: "بيانات الشراء", value: `${c.productDescription} × ${c.quantity}` },
              { label: "المورد", value: c.supplier || "—" },
              { label: "تكلفة الشراء", value: num(money(c.purchaseCost)) },
              { label: "المقدم", value: num(money(c.downPayment)) },
              { label: "سعر البيع بالتقسيط", value: num(money(c.downPayment + c.totalInstallments)) },
              { label: "خطة التقسيط", value: <>{c.rule.name} • {num(rate)} سنوي ثابت • الإصدار {num(String(c.rule.version))}</> },
              { label: "العائد محسوب على", value: profitBaseLabels[c.profitBase] },
              { label: "أول قسط / عدد الأقساط", value: `${formatDate(c.firstDueDate)} / ${c.installmentCount}` },
              {
                label: "أقساط محددة يدويًا",
                value: c.customInstallments.length
                  ? num(c.customInstallments.map((i) => `#${i.seq}: ${money(i.amount)}`).join(" • "))
                  : "لا يوجد — الحساب تلقائي",
              },
            ]}
          />
        </Panel>
      )}

      {tab === "activity" && (
        <Panel title="سجل النشاط">
          {activity.length ? (
            <ul className="flex flex-col gap-3">
              {activity.map((a) => (
                <li key={a.id} className="text-body text-secondary">
                  {formatDate(a.createdAt)} • <span className="text-text">{a.action}</span>
                  {a.actorName && ` • ${a.actorName}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-secondary">لا يوجد نشاط مسجّل.</p>
          )}
        </Panel>
      )}

      <Notice>أي تعديل مالي يُسجل باسمك ووقت التغيير والقيمة السابقة والجديدة. التصحيح بقيود عكسية.</Notice>
    </>
  );
}
