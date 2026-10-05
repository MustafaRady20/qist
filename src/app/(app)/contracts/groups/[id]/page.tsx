import type { Metadata } from "next";
import Link from "next/link";
import { ActionBar, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { Badge, ButtonLink } from "@/components/ui";
import { contractsCountLabel, formatAmount, formatDate } from "@/lib/format";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { getContractGroup } from "@/server/contracts/groups";
import { listCustomerContracts, listNextInstallments, type CustomerContractItem, type UpcomingInstallment } from "@/server/contracts/service";
import { orNotFound } from "../../load";
import { DissolveGroupButton } from "./DissolveGroupButton";

export const metadata: Metadata = { title: "مجموعة عقود · قسط" };

type Member = CustomerContractItem & { next?: UpcomingInstallment };
const whole = (p: number) => formatAmount(p, { whole: true });

const columns: Column<Member>[] = [
  {
    key: "code",
    header: "العقد",
    cell: (m) => (
      <Link href={`/contracts/${m.code}`} className="num hover:underline">
        {m.code}
      </Link>
    ),
  },
  { key: "product", header: "المشتريات", cell: (m) => m.productDescription },
  {
    key: "next",
    header: "القسط وموعده",
    cell: (m) =>
      m.next ? (
        <>
          <span className="num">{whole(m.next.remaining)}</span> • {formatDate(m.next.dueDate)}
        </>
      ) : (
        "—"
      ),
  },
  { key: "outstanding", header: "المتبقي", cell: (m) => whole(m.outstanding), numeric: true },
  { key: "status", header: "الحالة", cell: (m) => <Badge status={m.status} className="min-w-28" /> },
];

/** Figma "consolidation-done", and the group's page afterwards. */
export default async function ContractGroupPage({ params, searchParams }: PageProps<"/contracts/groups/[id]">) {
  const user = await requirePageUser();
  const group = await orNotFound(async () => getContractGroup((await params).id));
  const created = (await searchParams).created === "1";
  const [contracts, next] = await Promise.all([listCustomerContracts(group.customerId), listNextInstallments(group.customerId)]);
  const members: Member[] = contracts.filter((c) => c.groupId === group.id).map((c) => ({ ...c, next: next.find((i) => i.contractId === c.id) }));

  const due = members.filter((m) => m.next).map((m) => `${m.code}: ${whole(m.next!.remaining)} جنيه في ${formatDate(m.next!.dueDate)}`);
  const statement = `مرحبًا ${group.customer.fullName.split(" ")[0]}، بيان عقودك: ${due.join("، ")}. إجمالي المتبقي ${whole(members.reduce((s, m) => s + m.outstanding, 0))} جنيه.`;

  return (
    <>
      <PageHeader
        title={created ? "تم تجميع العقود للمتابعة" : group.name}
        description={
          group.dissolvedAt ? (
            `مجموعة مفكوكة منذ ${formatDate(group.dissolvedAt)}`
          ) : (
            <>
              {created && `${group.name} • `}
              {group.customer.fullName} • لم تتغير الأقساط أو المواعيد
            </>
          )
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العقود", href: "/contracts?tab=consolidated" }, { label: group.name }]}
      />
      {group.dissolvedAt ? (
        <Notice tone="warning">تم فك هذه المجموعة. عقودها مستمرة كما هي في ملف العميل.</Notice>
      ) : (
        <Notice tone="success">كل عقد نشط بجدوله ورصيده. عند استلام دفعة واحدة، اختر المبلغ المسدّد لكل عقد.</Notice>
      )}
      {group.note && <Notice>ملاحظة: {group.note}</Notice>}
      {members.length > 0 && (
        <Panel title="العقود داخل المجموعة">
          <DataTable caption="العقود داخل المجموعة" columns={columns} rows={members} rowKey={(m) => m.id} />
          <p className="text-caption text-secondary">{contractsCountLabel(members.length)} داخل المجموعة</p>
        </Panel>
      )}
      <ActionBar>
        <ButtonLink href={`/customers/${group.customer.code}`}>عرض حساب العميل</ButtonLink>
        {members.length > 0 && (
          <ButtonLink
            href={`https://wa.me/2${group.customer.whatsapp ?? group.customer.phone}?text=${encodeURIComponent(statement)}`}
            target="_blank"
            rel="noopener"
            variant="whatsapp"
          >
            إرسال البيان واتساب
          </ButtonLink>
        )}
        {!group.dissolvedAt && can(user.role, "contracts:write") && <DissolveGroupButton id={group.id} />}
      </ActionBar>
    </>
  );
}
