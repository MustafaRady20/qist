"use client";

import { Button, Icon } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-modal border border-border bg-surface p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-dangerBg text-dangerText">
        <Icon name="alert" />
      </span>
      <h1 className="text-h3 text-navy">تعذّر تحميل الصفحة</h1>
      <p className="text-body text-secondary">حدث خطأ غير متوقع. حاول مرة أخرى، وإذا تكرر تواصل مع الدعم.</p>
      <Button variant="outline" className="w-40" onClick={reset}>
        إعادة المحاولة
      </Button>
    </section>
  );
}
