import type { Metadata } from "next";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { todayInCairo } from "@/server/time";
import { RuleForm } from "../RuleForm";

export const metadata: Metadata = { title: "خطة تقسيط جديدة · قسط" };

export default async function NewRulePage() {
  const user = await requirePageUser();
  if (!can(user.role, "finance-rules:write")) return <Forbidden />;

  return (
    <>
      <PageHeader
        title="خطة تقسيط جديدة"
        description="تظهر الخطة في معالج العقود من تاريخ بدء السريان"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "الإعدادات", href: "/settings" }, { label: "خطة تقسيط جديدة" }]}
      />
      <RuleForm today={todayInCairo()} />
    </>
  );
}
