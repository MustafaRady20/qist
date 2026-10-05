import type { Metadata } from "next";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { CustomerForm } from "../CustomerForm";

export const metadata: Metadata = { title: "إضافة عميل · قسط" };

export default async function NewCustomerPage() {
  const user = await requirePageUser();
  if (!can(user.role, "customers:write")) return <Forbidden />;

  return (
    <>
      <PageHeader
        title="إضافة عميل"
        description="تحقق تلقائي من الهاتف والهوية لمنع تكرار السجلات"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العملاء", href: "/customers" }, { label: "إضافة عميل" }]}
      />
      <CustomerForm canUpload={can(user.role, "customers:documents")} canCreateContract={can(user.role, "contracts:write")} />
    </>
  );
}
