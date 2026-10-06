import type { Metadata } from "next";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { getLatestRule } from "@/server/finance-rules/service";
import { todayInCairo } from "@/server/time";
import { orNotFound } from "../../../../contracts/load";
import { RuleForm } from "../../RuleForm";

export const metadata: Metadata = { title: "تعديل خطة التقسيط · قسط" };

export default async function EditRulePage({ params }: PageProps<"/settings/finance-rules/[key]/edit">) {
  const user = await requirePageUser();
  if (!can(user.role, "finance-rules:write")) return <Forbidden />;
  const rule = await orNotFound(async () => getLatestRule(decodeURIComponent((await params).key)));

  return (
    <>
      <PageHeader
        title="تعديل خطة التقسيط"
        description={
          <>
            {rule.name} • الإصدار <span className="num">{rule.version}</span>
          </>
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "الإعدادات", href: "/settings" }, { label: rule.name }]}
      />
      <RuleForm
        today={todayInCairo()}
        rule={{
          key: rule.key,
          version: rule.version,
          name: rule.name,
          annualRateBp: rule.annualRateBp,
          minTermMonths: rule.minTermMonths,
          maxTermMonths: rule.maxTermMonths,
          minDownPaymentBp: rule.minDownPaymentBp,
          settlementPolicy: rule.settlementPolicy,
          allowedCategories: rule.allowedCategories,
        }}
      />
    </>
  );
}
