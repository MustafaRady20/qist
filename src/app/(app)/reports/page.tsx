import type { Metadata } from "next";
import { ActionBar } from "@/components/page/blocks";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { ButtonLink } from "@/components/ui";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { listReports } from "@/server/reports/service";

export const metadata: Metadata = { title: "التقارير · قسط" };

export default async function ReportsPage() {
  const user = await requirePageUser();
  if (!can(user.role, "reports:read")) return <Forbidden />;
  // The ledger has its own button below the catalogue.
  const reports = (await listReports()).filter((r) => r.slug !== "ledger");

  return (
    <>
      <PageHeader
        title="التقارير"
        description="تحليلات قابلة للتصفية والتصدير حسب الصلاحية"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "التقارير" }]}
        action={
          <ButtonLink href="/reports/actual-collection" className="max-lg:w-full lg:w-40">
            تقرير التحصيل
          </ButtonLink>
        }
      />
      <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <li key={r.slug} className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6">
            <h2 className="text-h4 text-text">{r.title}</h2>
            <p className="text-body grow text-secondary">{r.description}</p>
            <p className="text-caption text-secondary">{r.ranged ? "فترة مخصصة • مقارنة • تصدير" : "حتى اليوم • تصدير"}</p>
            <ButtonLink href={`/reports/${r.slug}`} variant="outline" className="self-start sm:w-50">
              فتح التقرير
            </ButtonLink>
          </li>
        ))}
      </ul>
      <ActionBar className="[&>*]:md:w-56">
        <ButtonLink href="/reports/ledger" variant="outline">
          دفتر الأستاذ المالي
        </ButtonLink>
      </ActionBar>
    </>
  );
}
