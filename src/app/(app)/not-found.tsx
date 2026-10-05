import { ButtonLink, Icon } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-modal border border-border bg-surface p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-infoBg text-infoText">
        <Icon name="search" />
      </span>
      <h1 className="text-h3 text-navy">الصفحة غير موجودة</h1>
      <p className="text-body text-secondary">السجل المطلوب غير موجود أو تم تغيير رابطه.</p>
      <ButtonLink href="/" variant="outline" className="w-40">
        العودة للرئيسية
      </ButtonLink>
    </section>
  );
}
