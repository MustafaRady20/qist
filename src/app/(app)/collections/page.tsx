import type { Metadata } from "next";
import { ActionBar, FilterBar, InfoCard, KpiGrid } from "@/components/page/blocks";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { pickQuery, pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { ButtonLink } from "@/components/ui";
import { followUpTabs, getFollowUpSummary, listFollowUps, type FollowUpCard } from "@/data/collections";
import { formatAmount, formatDayMonth } from "@/lib/format";

export const metadata: Metadata = { title: "متابعة السداد · قسط" };

const amt = (p: number) => formatAmount(p, { whole: true });

function Fact({ label, children, numeric }: { label: string; children: React.ReactNode; numeric?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-body text-secondary">{label}</dt>
      <dd className={numeric ? "text-num-sm num text-navy" : "text-body-lg font-medium text-navy"}>{children}</dd>
    </div>
  );
}

/** Figma follow-up card (r12): customer, phone, summary box, two actions. */
function FollowUp({ f }: { f: FollowUpCard }) {
  return (
    <article className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
      <header className="flex flex-col gap-4">
        <h2 className="text-h4 text-text">{f.customer}</h2>
        <p className="text-body num text-right text-secondary">{f.phone}</p>
      </header>
      <section className="flex flex-col gap-4 rounded-card border border-border p-6">
        <h3 className="text-h4 text-text">المبلغ وموعد التواصل</h3>
        <dl className="flex flex-col gap-4">
          <Fact label="المتبقي المطلوب" numeric>
            {amt(f.remaining)}
          </Fact>
          <Fact label="أيام التأخير" numeric>
            {f.daysLate}
          </Fact>
          <Fact label="آخر دفع">{formatDayMonth(f.lastPayment)}</Fact>
          <Fact label="آخر تواصل">{formatDayMonth(f.lastContact)}</Fact>
          <Fact label="الوعد بالسداد">{f.promiseDate ? formatDayMonth(f.promiseDate) : "—"}</Fact>
          <Fact label="المتابعة القادمة">{f.nextFollowUp}</Fact>
        </dl>
      </section>
      <div className="flex flex-col gap-4 sm:items-start">
        <ButtonLink href={`/collections/note?contract=${f.contract}`} className="sm:w-50">
          تسجيل نتيجة التواصل
        </ButtonLink>
        <ButtonLink href={`/whatsapp?phone=${f.phone}`} variant="whatsapp" className="sm:w-50">
          إرسال واتساب
        </ButtonLink>
      </div>
    </article>
  );
}

export default async function CollectionsPage({ searchParams }: PageProps<"/collections">) {
  const sp = await searchParams;
  const tab = pickTab(followUpTabs, sp.tab);
  const q = pickQuery(sp.q);
  const [summary, cards] = await Promise.all([getFollowUpSummary(), listFollowUps({ tab, q })]);

  return (
    <>
      <PageHeader
        title="متابعة السداد"
        description="من أتواصل معه اليوم؟ راجع المتأخر والمبلغ المطلوب ثم سجّل نتيجة التواصل."
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "متابعة السداد" }]}
        action={
          <ButtonLink href="/collections/note" className="max-lg:w-full lg:w-40">
            تسجيل متابعة
          </ButtonLink>
        }
      />
      <KpiGrid>
        <KpiCard label="أتواصل معهم اليوم" value={String(summary.today.count)} note={summary.today.note} />
        <KpiCard label="إجمالي المطلوب" value={amt(summary.total.amount)} note={summary.total.note} />
        <KpiCard label="وعود مفتوحة" value={String(summary.promises.count)} note={summary.promises.note} />
      </KpiGrid>
      <InfoCard title="متابعة السداد • بمن أتواصل اليوم؟">
        اختر العميل، راجع المطلوب، ثم سجّل نتيجة التواصل أو موعد السداد. سجّل دفعة فقط عند استلام المال.
      </InfoCard>
      <SegmentedTabs items={followUpTabs} value={tab} param="tab" label="قائمة المتابعة" keep={{ q }} />
      <FilterBar placeholder="اسم العميل أو رقم الهاتف" q={q} keep={{ tab }} />
      {cards.length ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {cards.map((f) => (
            <FollowUp key={f.contract} f={f} />
          ))}
        </div>
      ) : (
        <p className="text-body rounded-panel border border-border bg-surface p-6 text-secondary">
          لا يوجد عملاء في هذه القائمة.
        </p>
      )}
      <ActionBar className="[&>*]:md:w-auto [&>*]:md:min-w-40">
        <ButtonLink href="/payments/new" variant="outline">
          تسجيل دفعة
        </ButtonLink>
        <ButtonLink href="/collections/promise" className="md:w-52">
          إضافة وعد بالسداد
        </ButtonLink>
      </ActionBar>
    </>
  );
}
