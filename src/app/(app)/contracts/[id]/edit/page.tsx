import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { todayInCairo } from "@/server/time";
import { ContractWizard } from "../../ContractWizard";
import { loadContract, loadCustomerOption, loadRuleOptions } from "../../load";

export const metadata: Metadata = { title: "تعديل مسودة عقد · قسط" };

export default async function EditDraftPage({ params }: PageProps<"/contracts/[id]/edit">) {
  const user = await requirePageUser();
  if (!can(user.role, "contracts:write")) return <Forbidden />;
  const c = await loadContract((await params).id);
  // Confirmed contracts are never edited; corrections are reversing entries.
  if (c.status !== "draft") redirect(`/contracts/${c.code}`);
  const [rules, customer] = await Promise.all([loadRuleOptions(), loadCustomerOption(c.customer.code)]);

  return (
    <>
      <PageHeader
        title="تعديل مسودة العقد"
        description={
          <>
            <span className="num">{c.code}</span> • {c.customer.fullName}
          </>
        }
        breadcrumbs={[{ label: "العقود", href: "/contracts" }, { label: c.code, href: `/contracts/${c.code}` }, { label: "تعديل المسودة" }]}
      />
      <ContractWizard
        rules={rules}
        today={todayInCairo()}
        customer={customer}
        canConfirm={can(user.role, "contracts:confirm")}
        draft={{
          code: c.code,
          productDescription: c.productDescription,
          quantity: c.quantity,
          supplier: c.supplier,
          originalPrice: c.originalPrice,
          purchaseCost: c.purchaseCost,
          downPayment: c.downPayment,
          financeRuleId: c.financeRuleId,
          profitBase: c.profitBase,
          termMonths: c.termMonths,
          fees: c.fees,
          firstDueDate: c.firstDueDate,
          customInstallments: c.customInstallments,
        }}
      />
    </>
  );
}
