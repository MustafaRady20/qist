"use client";

import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui";

/**
 * Print, PDF and CSV. The PDF is produced by the browser's own print dialog
 * ("حفظ كـ PDF"), which shapes Arabic correctly; the document title becomes
 * the suggested file name.
 */
export function StatementActions({ csvHref, fileName }: { csvHref: string; fileName: string }) {
  const [hint, setHint] = useState(false);

  const print = (asPdf: boolean) => {
    const title = document.title;
    if (asPdf) {
      document.title = fileName;
      setHint(true);
    }
    window.addEventListener("afterprint", () => (document.title = title), { once: true });
    window.print();
  };

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-36">
        <Button onClick={() => print(false)}>طباعة</Button>
        <Button variant="outline" onClick={() => print(true)}>
          تحميل PDF ↓
        </Button>
        <a href={csvHref} download className={buttonClasses("outline")}>
          تصدير CSV ↓
        </a>
      </div>
      {hint && <p className="text-caption text-secondary">في نافذة الطباعة اختر «حفظ بتنسيق PDF» كوجهة.</p>}
    </div>
  );
}
