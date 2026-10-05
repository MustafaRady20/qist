import type { Metadata } from "next";
import Link from "next/link";
import { ActionBar, Notice } from "@/components/page/blocks";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { Button, ButtonLink, Icon, SelectField } from "@/components/ui";
import { deliveryLabels, getThread, listConversations, type Message } from "@/data/whatsapp";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "مركز واتساب · قسط" };

function Bubble({ m }: { m: Message }) {
  const out = m.direction === "out";
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-card p-4 md:me-12",
        out ? "bg-accentBg" : "bg-bg",
      )}
    >
      <p className="text-body whitespace-pre-line text-text">{m.body}</p>
      <p className={cn("text-caption flex items-center gap-1", out ? "text-successText" : "text-secondary")}>
        <span className="num">{m.time}</span> •{" "}
        {out && m.state ? (
          <>
            {deliveryLabels[m.state]}
            {m.state === "read" && <Icon name="check" size={14} />}
          </>
        ) : (
          "رسالة واردة"
        )}
      </p>
    </li>
  );
}

export default async function WhatsAppPage({ searchParams }: PageProps<"/whatsapp">) {
  const { c } = await searchParams;
  const conversations = await listConversations();
  const activeId = typeof c === "string" ? c : conversations[0].id;
  const thread = await getThread(activeId);

  return (
    <>
      <PageHeader
        title="مركز واتساب"
        description="قناة التواصل مع العملاء • متصل بمنصة WhatsApp Business الرسمية"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "مركز واتساب" }]}
        action={
          <ButtonLink href="/whatsapp/templates" className="max-lg:w-full lg:w-40">
            القوالب والرسائل
          </ButtonLink>
        }
      />
      <ActionBar>
        <ButtonLink href="/whatsapp/automation" variant="outline">
          قواعد الإرسال
        </ButtonLink>
      </ActionBar>

      <div className="grid items-start gap-6 xl:grid-cols-[336px_minmax(0,1fr)]">
        <Panel title="المحادثات">
          <ul className="flex flex-col">
            {conversations.map((conv) => (
              <li key={conv.id} className="border-b border-border">
                <Link
                  href={`?c=${conv.id}`}
                  scroll={false}
                  aria-current={conv.id === activeId ? "true" : undefined}
                  className="flex flex-col gap-4 rounded-control py-4 outline-none hover:bg-bg focus-visible:ring-2 focus-visible:ring-info aria-[current]:bg-bg"
                >
                  <span className="text-h4 text-text">{conv.customer}</span>
                  <span className={cn("text-caption", conv.state === "failed" ? "text-dangerText" : "text-secondary")}>
                    {deliveryLabels[conv.state]} • {conv.ago}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink href="/whatsapp/failed" variant="outline" className="w-full">
            عرض الرسائل الفاشلة
          </ButtonLink>
        </Panel>

        <Panel
          title={
            <>
              {thread.customer} • <span className="num">{thread.phone}</span>
            </>
          }
        >
          <p className="text-caption -mt-2 text-secondary">
            {thread.consent ? "موافق على التواصل" : "لم يوافق على التواصل"} • آخر تفاعل {thread.lastInteraction}
          </p>
          <ol aria-label="الرسائل" className="flex flex-col gap-4">
            {thread.messages.map((m) => (
              <Bubble key={m.id} m={m} />
            ))}
          </ol>
          <form className="flex flex-col gap-4">
            <SelectField label="القالب المختار" name="template" defaultValue="receipt">
              <option value="receipt">{thread.template.name}</option>
              <option value="reminder">تذكير بموعد القسط</option>
              <option value="overdue">تنبيه تأخير</option>
            </SelectField>
            <section className="flex flex-col gap-1 rounded-control border border-border px-4 py-3">
              <h3 className="text-label text-secondary">معاينة الرسالة</h3>
              <p className="text-body whitespace-pre-line text-text">{thread.template.preview}</p>
            </section>
            <Button variant="whatsapp" className="self-start sm:w-50" disabled={!thread.consent}>
              إرسال الرسالة
            </Button>
          </form>
          <Notice>تظهر للعميل مبالغ السداد ومواعيدها فقط. تكلفة الشراء والربح وحساب العائد لا تُرسل.</Notice>
        </Panel>
      </div>
    </>
  );
}
