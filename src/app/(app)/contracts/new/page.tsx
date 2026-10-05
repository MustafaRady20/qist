import type { Metadata } from "next";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { todayInCairo } from "@/server/time";
import { ContractWizard } from "../ContractWizard";
import { loadCustomerOption, loadRuleOptions } from "../load";

export const metadata: Metadata = { title: "إنشاء عقد جديد · قسط" };

export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const user = await requirePageUser();
  if (!can(user.role, "contracts:write")) return <Forbidden />;
  const { customer: code } = await searchParams;
  const [rules, customer] = await Promise.all([loadRuleOptions(), typeof code === "string" ? loadCustomerOption(code) : undefined]);

  return (
    <>
      <PageHeader
        title="إنشاء عقد جديد"
        description="ست خطوات: العميل، الشراء، المقدم، الخطة، الجدول ثم المراجعة"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العقود", href: "/contracts" }, { label: "إنشاء عقد جديد" }]}
      />
      <ContractWizard rules={rules} today={todayInCairo()} customer={customer} canConfirm={can(user.role, "contracts:confirm")} />
    </>
  );
}
