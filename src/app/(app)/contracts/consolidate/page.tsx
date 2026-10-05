import type { Metadata } from "next";
import { Notice } from "@/components/page/blocks";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { ButtonLink, TextField } from "@/components/ui";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listCustomerContracts, listNextInstallments } from "@/server/contracts/service";
import { getCustomer } from "@/server/customers/service";
import { orNotFound } from "../load";
import { ConsolidateForm, type GroupableContract } from "./ConsolidateForm";

export const metadata: Metadata = { title: "تجميع عقود العميل · قسط" };

export default async function ConsolidatePage({ searchParams }: PageProps<"/contracts/consolidate">) {
  const user = await requirePageUser();
  if (!can(user.role, "contracts:write")) return <Forbidden />;
  const { customer: code } = await searchParams;

  const header = (
    <PageHeader
      title="تجميع عقود العميل"
      description="كل عقد يحتفظ بقسطه وميعاده ورصيده • التجميع للعرض والمتابعة"
      breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العقود", href: "/contracts" }, { label: "تجميع عقود العميل" }]}
    />
  );
  if (typeof code !== "string") {
    return (
      <>
        {header}
        <Notice>افتح التجميع من ملف العميل أو من صفحة أحد عقوده لاختيار العقود.</Notice>
      </>
    );
  }

  const customer = await orNotFound(() => getCustomer(code));
  const [contracts, next] = await Promise.all([listCustomerContracts(customer.id), listNextInstallments(customer.id)]);
  const groupable: GroupableContract[] = contracts
    .filter((c) => (c.status === "active" || c.status === "overdue") && !c.groupId)
    .map((c) => {
      const n = next.find((i) => i.contractId === c.id);
      return {
        id: c.id,
        code: c.code,
        productDescription: c.productDescription,
        paid: c.paid,
        outstanding: c.outstanding,
        status: c.status as "active" | "overdue",
        next: n ? { dueDate: n.dueDate, remaining: n.remaining, status: n.status as NonNullable<GroupableContract["next"]>["status"] } : null,
      };
    });

  return (
    <>
      {header}
      <TextField label="العميل" value={`${customer.fullName} • ${customer.code}`} readOnly disabled />
      {groupable.length < 2 ? (
        <>
          <Notice tone="warning">التجميع يحتاج عقدين نشطين على الأقل غير منضمّين لمجموعة. لا يوجد ما يكفي لدى هذا العميل.</Notice>
          <div>
            <ButtonLink href={`/customers/${customer.code}`} variant="outline" className="w-40">
              ملف العميل
            </ButtonLink>
          </div>
        </>
      ) : (
        <ConsolidateForm customer={{ id: customer.id, code: customer.code, fullName: customer.fullName }} contracts={groupable} />
      )}
    </>
  );
}
