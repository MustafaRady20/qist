import type { Metadata } from "next";
import { Notice } from "@/components/page/blocks";
import { PageHeader } from "@/components/page/PageHeader";
import { ButtonLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { getSettlementQuote } from "@/server/contracts/settlement";
import { AppError } from "@/server/errors";
import { loadContract } from "../../load";
import { SettlementForm } from "./SettlementForm";

export const metadata: Metadata = { title: "التسوية المبكرة · قسط" };

export default async function SettlementPage({ params }: PageProps<"/contracts/[id]/settlement">) {
  const user = await requirePageUser();
  const c = await loadContract((await params).id);

  // Only active contracts with a balance can be settled; anything else explains why.
  const quote = await getSettlementQuote(c.id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "invalid_state") return error.message;
    throw error;
  });

  return (
    <>
      <PageHeader
        title="التسوية المبكرة"
        description={
          <>
            <span className="num">{c.code}</span> • {c.customer.fullName} • معاينة مفصلة قبل التأكيد
            {typeof quote !== "string" && <> • محسوبة بتاريخ {formatDate(quote.asOf)}</>}
          </>
        }
        breadcrumbs={[{ label: "العقود", href: "/contracts" }, { label: c.code, href: `/contracts/${c.code}` }, { label: "التسوية المبكرة" }]}
      />
      {typeof quote === "string" ? (
        <>
          <Notice tone="warning">{quote}</Notice>
          <div>
            <ButtonLink href={`/contracts/${c.code}`} variant="outline" className="w-40">
              رجوع للعقد
            </ButtonLink>
          </div>
        </>
      ) : (
        <SettlementForm quote={quote} canSettle={can(user.role, "contracts:settle")} />
      )}
    </>
  );
}
