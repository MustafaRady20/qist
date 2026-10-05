import type { Metadata } from "next";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { maskNationalId } from "@/server/validation";
import { CustomerForm } from "../../CustomerForm";
import { loadCustomer } from "../../load";

export const metadata: Metadata = { title: "تعديل بيانات العميل · قسط" };

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const user = await requirePageUser();
  if (!can(user.role, "customers:write")) return <Forbidden />;
  const c = await loadCustomer((await params).id);

  return (
    <>
      <PageHeader
        title="تعديل بيانات العميل"
        description={
          <>
            استكمل بيانات التواصل والضامن مع الاحتفاظ بالسجل المالي • <span className="num">{c.code}</span>
          </>
        }
        breadcrumbs={[
          { label: "العملاء", href: "/customers" },
          { label: c.fullName, href: `/customers/${c.code}` },
          { label: "تعديل البيانات" },
        ]}
      />
      <CustomerForm
        canUpload={can(user.role, "customers:documents")}
        customer={{
          code: c.code,
          fullName: c.fullName,
          phone: c.phone,
          altPhone: c.altPhone,
          whatsapp: c.whatsapp,
          nationalIdMasked: maskNationalId(c.nationalId),
          address: c.address,
          employer: c.employer,
          jobTitle: c.jobTitle,
          monthlyIncome: c.monthlyIncome,
          emergencyContactName: c.emergencyContactName,
          emergencyContactPhone: c.emergencyContactPhone,
          guarantorName: c.guarantorName,
          guarantorPhone: c.guarantorPhone,
          guarantorRelation: c.guarantorRelation,
          guarantorAddress: c.guarantorAddress,
        }}
      />
    </>
  );
}
