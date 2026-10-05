import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/page/blocks";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { ButtonLink } from "@/components/ui";
import { formatAmount, formatDate, installmentsCountLabel } from "@/lib/format";
import { requirePageUser } from "@/server/auth/dal";
import { getCustomer } from "@/server/customers/service";
import { loadContract } from "../../load";

export const metadata: Metadata = { title: "تم إنشاء العقد · قسط" };

/** Figma "contract-created": confirmation plus the message to send the customer. */
export default async function ContractCreatedPage({ params }: PageProps<"/contracts/[id]/created">) {
  await requirePageUser();
  const c = await loadContract((await params).id);
  if (c.status === "draft" || c.status === "cancelled") redirect(`/contracts/${c.code}`);
  const customer = await getCustomer(c.customer.id);

  const first = c.installments[0];
  const message =
    `مرحبًا ${customer.fullName.split(" ")[0]}، تم إنشاء عقدك ${c.code} (${c.productDescription}). ` +
    `${installmentsCountLabel(c.installmentCount)} شهرية، قيمة القسط ${formatAmount(first.amount)} جنيه، ` +
    `وأول استحقاق ${formatDate(first.dueDate)}. إجمالي الأقساط ${formatAmount(c.totalInstallments)} جنيه.`;
  const whatsapp = `https://wa.me/2${customer.whatsapp ?? customer.phone}?text=${encodeURIComponent(message)}`;

  return (
    <>
      <PageHeader
        title="تم إنشاء العقد بنجاح"
        description={
          <>
            <span className="num">{c.code}</span> • {c.customer.fullName}
          </>
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "العقود", href: "/contracts" }, { label: "تم إنشاء العقد بنجاح" }]}
      />
      <Notice tone="success">
        تم إنشاء {installmentsCountLabel(c.installmentCount)} وربط خطة التقسيط بالإصدار <span className="num">{c.rule.version}</span> من قاعدة «{c.rule.name}».
      </Notice>
      <Panel title="رسالة التأكيد للعميل">
        <p className="text-body text-secondary">{message}</p>
      </Panel>
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-48">
        <ButtonLink href={`/contracts/${c.code}`}>عرض العقد</ButtonLink>
        <ButtonLink href={whatsapp} target="_blank" rel="noopener" variant="whatsapp">
          فتح محادثة واتساب
        </ButtonLink>
      </div>
    </>
  );
}
