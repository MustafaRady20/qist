import type { Metadata } from "next";
import Link from "next/link";
import { ActionBar, DetailList, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { Badge, ButtonLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import { activeContractsLabel, formatAmount, formatDate, formatPhone } from "@/lib/format";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import {
  listCustomerContracts,
  listNextInstallments,
  type CustomerContractItem,
  type UpcomingInstallment,
} from "@/server/contracts/service";
import { listCustomerDocuments } from "@/server/customers/documents";
import { listCustomerActivity } from "@/server/customers/service";
import { maskNationalId } from "@/server/validation";
import { DocumentsTable } from "../DocumentsTable";
import { loadCustomer } from "../load";
import { BlockCustomerDialog } from "./BlockCustomerDialog";

export const metadata: Metadata = { title: "ملف العميل · قسط" };

const tabs = [
  { value: "overview", label: "نظرة عامة" },
  { value: "contracts", label: "العقود" },
  { value: "installments", label: "الأقساط" },
  { value: "documents", label: "المستندات" },
  { value: "activity", label: "النشاط" },
] as const;

const amt = (p: number) => formatAmount(p, { whole: true });
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const missing = <span className="text-secondary">غير مسجّل</span>;
const text = (v: string | null) => v || missing;
const phone = (v: string | null) => (v ? <span className="num">{formatPhone(v)}</span> : missing);

const contractColumns: Column<CustomerContractItem>[] = [
  {
    key: "code",
    header: "العقد",
    cell: (r) => (
      <Link href={`/contracts/${r.code}`} className="num underline-offset-4 hover:underline">
        {r.code}
      </Link>
    ),
  },
  { key: "product", header: "المشتريات", cell: (r) => r.productDescription },
  { key: "total", header: "إجمالي الأقساط", cell: (r) => amt(r.totalInstallments), numeric: true },
  { key: "installment", header: "القسط", cell: (r) => (r.installment === null ? "—" : amt(r.installment)), numeric: true },
  { key: "paid", header: "المدفوع", cell: (r) => amt(r.paid), numeric: true },
  { key: "outstanding", header: "المتبقي", cell: (r) => amt(r.outstanding), numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
];

const installmentColumns: Column<UpcomingInstallment>[] = [
  { key: "code", header: "العقد", cell: (r) => r.contractCode, numeric: true },
  { key: "due", header: "موعد الاستحقاق", cell: (r) => formatDate(r.dueDate) },
  { key: "remaining", header: "متبقي القسط", cell: (r) => amt(r.remaining), numeric: true },
  { key: "status", header: "الحالة", cell: (r) => <Badge status={r.status} className="min-w-28" /> },
];

export default async function CustomerProfilePage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const user = await requirePageUser();
  const c = await loadCustomer((await params).id);
  const tab = pickTab([...tabs], (await searchParams).tab);
  const [contracts, upcoming, documents, activity] = await Promise.all([
    listCustomerContracts(c.id),
    listNextInstallments(c.id),
    listCustomerDocuments(c.id),
    listCustomerActivity(c.id),
  ]);

  const canWrite = can(user.role, "customers:write");
  const canDocuments = can(user.role, "customers:documents");
  const blocked = c.status === "blocked";
  const b = c.balances;
  const show = (section: (typeof tabs)[number]["value"]) => tab === "overview" || tab === section;

  const active = contracts.filter((k) => k.status === "active" || k.status === "overdue");
  const finished = contracts.filter((k) => k.status === "completed" || k.status === "settled");
  const allPaid = active.length === 0 && finished.length > 0;

  const canContract = can(user.role, "contracts:write");
  const groupable = active.filter((k) => !k.groupId).length;

  const incomplete = [
    !c.nationalId && "الرقم القومي",
    !c.address && "العنوان",
    c.guarantorName && !c.guarantorPhone && "هاتف الضامن",
    c.guarantorName && !c.guarantorRelation && "صلة قرابة الضامن",
  ].filter(Boolean) as string[];

  // The earliest date with something to pay, and every contract due on it.
  const nextDue = upcoming.filter((i) => i.dueDate === upcoming[0]?.dueDate);
  const nextDueTotal = sum(nextDue.map((i) => i.remaining));
  const nextDueLate = nextDue[0]?.status === "overdue";

  const whatsapp = c.whatsapp ?? c.phone;

  return (
    <>
      <PageHeader
        title={c.fullName}
        description={
          <>
            عميل منذ {formatDate(c.createdAt)} • <span className="num">{formatPhone(c.phone)}</span> •{" "}
            <span className="num">{c.code}</span>
          </>
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العملاء", href: "/customers" }, { label: c.fullName }]}
      />

      <div className="flex flex-wrap gap-3">
        {blocked && <Badge status="blocked" />}
        {incomplete.length > 0 && <Badge tone="warning">بيانات تحتاج استكمال</Badge>}
        {b.activeContracts > 0 && <Badge tone="info">{activeContractsLabel(b.activeContracts)}</Badge>}
        {b.overdue > 0 ? (
          <Badge tone="danger">متأخر في السداد</Badge>
        ) : b.outstanding > 0 ? (
          <Badge tone="success">منتظم في السداد</Badge>
        ) : (
          contracts.length > 0 && <Badge tone="success">بدون رصيد حالي</Badge>
        )}
      </div>

      <ActionBar>
        {canContract && !blocked && (
          <ButtonLink href={`/contracts/new?customer=${c.code}`}>{allPaid ? "إنشاء عقد جديد" : "شراء جديد بالتقسيط"}</ButtonLink>
        )}
        {canContract && groupable >= 2 && (
          <ButtonLink href={`/contracts/consolidate?customer=${c.code}`} variant="outline">
            تجميع العقود
          </ButtonLink>
        )}
        <ButtonLink href={`/customers/${c.code}/statement`} variant="outline">
          كشف الحساب
        </ButtonLink>
        <ButtonLink href={`https://wa.me/2${whatsapp}`} target="_blank" rel="noopener" variant="whatsapp">
          إرسال واتساب
        </ButtonLink>
        {canWrite && (
          <ButtonLink href={`/customers/${c.code}/edit`} variant="outline">
            تعديل البيانات
          </ButtonLink>
        )}
        <ButtonLink href={`/customers/${c.code}/documents`} variant="outline">
          {canDocuments ? "رفع مستند" : "المستندات"}
        </ButtonLink>
        {can(user.role, "customers:block") && <BlockCustomerDialog code={c.code} blocked={blocked} />}
      </ActionBar>

      {blocked && <Notice tone="danger">العميل محظور: لا يمكن إنشاء عقود جديدة له. تحصيل الأقساط القائمة مستمر.</Notice>}
      {allPaid && <Notice tone="success">اكتمل سداد جميع العقود. يمكنك إنشاء عقد جديد عند عودة العميل مع الاحتفاظ بسجل السداد السابق.</Notice>}

      {allPaid ? (
        <KpiGrid>
          <KpiCard label="إجمالي المدفوع" value={amt(b.paid)} note="محفوظ في التاريخ" />
          <KpiCard label="الرصيد الحالي" value={formatAmount(b.outstanding)} note="لا التزامات حالية" />
          <KpiCard
            label="العقود المكتملة"
            value={String(finished.length)}
            note={<span className="num">{finished.map((k) => k.code).join(" • ")}</span>}
          />
        </KpiGrid>
      ) : (
        active.length > 0 && (
          <KpiGrid>
            <KpiCard label="إجمالي الأقساط" value={amt(sum(active.map((k) => k.totalInstallments)))} note="للعقود النشطة • دون المقدم" />
            <KpiCard label="المحصّل من الأقساط" value={amt(sum(active.map((k) => k.paid)))} note="للعقود النشطة • دون المقدم" />
            <KpiCard label="المتبقي من الأقساط" value={amt(b.outstanding)} note="للعقود النشطة • جنيه مصري" />
            <KpiCard label="المتأخر" value={amt(b.overdue)} note={b.overdue > 0 ? "أقساط فات موعدها" : "لا توجد أقساط متأخرة"} />
          </KpiGrid>
        )
      )}

      {nextDue.length > 0 && (
        <section
          className={cn(
            "flex flex-col gap-4 rounded-panel border p-6",
            nextDueLate ? "border-dangerBg bg-dangerBg" : "border-navSelected bg-accentBg",
          )}
        >
          <h2 className="text-h4 text-text">
            {nextDueLate ? "قسط متأخر منذ" : "الاستحقاق القادم"} • {formatDate(nextDue[0].dueDate)}
          </h2>
          <p className="text-body text-secondary">
            <span className="num">{amt(nextDueTotal)}</span> جنيه
            {nextDue.length > 1 &&
              nextDue.map((i, n) => (
                <span key={i.contractId}>
                  {n === 0 ? " • " : " + "}
                  <span className="num">
                    {i.contractCode}: {amt(i.remaining)}
                  </span>{" "}
                  جنيه
                </span>
              ))}
            {nextDue.length === 1 && (
              <>
                {" • "}
                <span className="num">{nextDue[0].contractCode}</span>
              </>
            )}
          </p>
        </section>
      )}

      <SegmentedTabs items={[...tabs]} value={tab} param="tab" label="أقسام ملف العميل" />

      {show("contracts") && (
        <Panel title={allPaid ? "التاريخ المالي" : "المشتريات والعقود"}>
          {contracts.length ? (
            <DataTable caption="عقود العميل" columns={contractColumns} rows={contracts} rowKey={(r) => r.id} />
          ) : (
            <p className="text-body py-8 text-center text-secondary">لا توجد عقود لهذا العميل بعد.</p>
          )}
        </Panel>
      )}

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="بيانات العميل والتواصل">
            <DetailList
              items={[
                { label: "الهاتف الأساسي", value: phone(c.phone) },
                { label: "هاتف بديل", value: phone(c.altPhone) },
                { label: "واتساب", value: phone(c.whatsapp) },
                { label: "العنوان", value: text(c.address) },
                { label: "العمل", value: [c.jobTitle, c.employer].filter(Boolean).join(" • ") || missing },
                {
                  label: "الدخل",
                  value:
                    c.monthlyIncome === null ? (
                      missing
                    ) : (
                      <>
                        <span className="num">{amt(c.monthlyIncome)}</span> جنيه شهريًا
                      </>
                    ),
                },
                { label: "الهوية", value: c.nationalId ? <span className="num">{maskNationalId(c.nationalId)}</span> : missing },
                {
                  label: "جهة اتصال للطوارئ",
                  value:
                    c.emergencyContactName || c.emergencyContactPhone ? (
                      <>
                        {c.emergencyContactName} {c.emergencyContactPhone && <span className="num">{formatPhone(c.emergencyContactPhone)}</span>}
                      </>
                    ) : (
                      missing
                    ),
                },
              ]}
            />
          </Panel>
          <Panel title="الضامن واستكمال الملف">
            <DetailList
              items={[
                { label: "الاسم", value: text(c.guarantorName) },
                { label: "صلة القرابة", value: text(c.guarantorRelation) },
                { label: "رقم الهاتف", value: phone(c.guarantorPhone) },
                { label: "العنوان", value: text(c.guarantorAddress) },
                { label: "هوية الضامن", value: documents.some((d) => d.kind === "guarantor_id") ? "مرفوعة" : "غير مرفوعة" },
                { label: "حالة البيانات", value: incomplete.length ? `يحتاج استكمال: ${incomplete.join("، ")}` : "مكتملة" },
              ]}
            />
          </Panel>
        </div>
      )}

      {show("installments") && !allPaid && (
        <Panel title="الأقساط القادمة • كل عقد بقسطه وموعده">
          {upcoming.length ? (
            <>
              <DataTable caption="القسط القادم لكل عقد" columns={installmentColumns} rows={upcoming} rowKey={(r) => r.contractId} />
              <div className="text-caption flex justify-between gap-4 text-secondary">
                <p>
                  المطلوب في أقرب موعد: <span className="num">{amt(nextDueTotal)}</span> جنيه
                </p>
                <p>لكل عقد رصيد مستقل</p>
              </div>
            </>
          ) : (
            <p className="text-body py-8 text-center text-secondary">لا توجد أقساط قادمة.</p>
          )}
        </Panel>
      )}

      {show("documents") && (
        <Panel
          title="المستندات"
          action={
            <Link href={`/customers/${c.code}/documents`} className="text-label text-infoText hover:underline">
              كل المستندات
            </Link>
          }
        >
          {documents.length ? (
            <DocumentsTable customerCode={c.code} documents={tab === "overview" ? documents.slice(0, 5) : documents} canOpen={canDocuments} />
          ) : (
            <p className="text-body py-8 text-center text-secondary">لا توجد مستندات مرفوعة لهذا العميل.</p>
          )}
        </Panel>
      )}

      {show("activity") && (
        <Panel title="آخر نشاط على حساب العميل">
          {activity.length ? (
            <ul className="flex flex-col gap-3">
              {(tab === "overview" ? activity.slice(0, 3) : activity).map((a) => (
                <li key={a.id} className="text-body text-secondary">
                  {formatDate(a.createdAt)} • <span className="text-text">{a.action}</span>
                  {a.ref && (
                    <>
                      {" • "}
                      <span className="num">{a.ref}</span>
                    </>
                  )}
                  {a.actorName && ` • ${a.actorName}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-secondary">لا يوجد نشاط مسجّل.</p>
          )}
        </Panel>
      )}
    </>
  );
}
