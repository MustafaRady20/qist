import type { Metadata } from "next";
import { Notice } from "@/components/page/blocks";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { ButtonLink, Icon } from "@/components/ui";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listCustomerDocuments } from "@/server/customers/documents";
import { DocumentUploader } from "../../DocumentPicker";
import { DocumentsTable } from "../../DocumentsTable";
import { loadCustomer } from "../../load";

export const metadata: Metadata = { title: "مستندات العميل · قسط" };

export default async function CustomerDocumentsPage({ params, searchParams }: PageProps<"/customers/[id]/documents">) {
  const user = await requirePageUser();
  const customer = await loadCustomer((await params).id);
  const documents = await listCustomerDocuments(customer.id);
  const canManage = can(user.role, "customers:documents");
  const uploadFailed = (await searchParams).upload === "failed";

  return (
    <>
      <PageHeader
        title="مستندات العميل"
        description={`${customer.fullName} • محفوظة وفق صلاحيات الوصول`}
        breadcrumbs={[
          { label: "العملاء", href: "/customers" },
          { label: customer.fullName, href: `/customers/${customer.code}` },
          { label: "مستندات العميل" },
        ]}
      />
      {uploadFailed && <Notice tone="warning">تم حفظ بيانات العميل، لكن تعذّر رفع المستند المرفق. ارفعه من هنا مرة أخرى.</Notice>}
      {canManage ? (
        <DocumentUploader customerCode={customer.code} />
      ) : (
        <Notice>رفع المستندات وفتحها متاح لصاحب الحساب والمدير فقط.</Notice>
      )}
      <Panel title="المستندات">
        {documents.length ? (
          <DocumentsTable customerCode={customer.code} documents={documents} canOpen={canManage} />
        ) : (
          <p className="text-body py-8 text-center text-secondary">لا توجد مستندات مرفوعة لهذا العميل.</p>
        )}
        <Pagination total={documents.length} />
      </Panel>
      <div>
        <ButtonLink href={`/customers/${customer.code}`} variant="outline" className="w-40" startIcon={<Icon name="arrow" className="rotate-180" />}>
          العودة للملف
        </ButtonLink>
      </div>
    </>
  );
}
