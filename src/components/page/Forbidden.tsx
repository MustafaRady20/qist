import { ButtonLink, Icon } from "@/components/ui";

/** Figma "permission-denied" pattern. */
export function Forbidden() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-modal border border-border bg-surface p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-dangerBg text-dangerText">
        <Icon name="shield" />
      </span>
      <h1 className="text-h3 text-navy">غير مصرح بهذا الإجراء</h1>
      <p className="text-body text-secondary">ليست لديك صلاحية لفتح هذه الصفحة. تواصل مع صاحب الحساب إذا كنت تحتاج إليها.</p>
      <ButtonLink href="/" variant="outline" className="w-40">
        العودة للرئيسية
      </ButtonLink>
    </section>
  );
}
