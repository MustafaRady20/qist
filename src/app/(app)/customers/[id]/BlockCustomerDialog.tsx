"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Icon, TextareaField } from "@/components/ui";
import { setCustomerBlockedAction } from "../actions";

/** Figma "block-customer": confirm dialog with a mandatory reason. Also used to lift the block. */
export function BlockCustomerDialog({ code, blocked }: { code: string; blocked: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const close = () => {
    dialog.current?.close();
    setReason("");
    setError(undefined);
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await setCustomerBlockedAction(code, !blocked, reason);
      if (result.error) setError(result.error);
      else close();
    });

  return (
    <>
      <Button variant="outline" onClick={() => dialog.current?.showModal()}>
        {blocked ? "إلغاء الحظر" : "حظر العميل"}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="block-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!pending) close();
        }}
        // `!`: the dialog sits inside ActionBar, which sizes its direct children.
        className="m-auto w-[min(600px,calc(100vw_-_32px))]! rounded-modal bg-surface p-6 text-text backdrop:bg-navy/40 md:p-10"
      >
        <div className="flex flex-col items-start gap-6">
          <Icon name="alert" className="text-dangerText" />
          <h2 id="block-title" className="text-h2 text-navy">
            {blocked ? "تأكيد إلغاء حظر العميل" : "تأكيد حظر العميل"}
          </h2>
          <p className="text-body text-secondary">
            {blocked
              ? "سيتمكن العميل من إنشاء عقود جديدة مرة أخرى. يُسجَّل الإجراء وسببه في سجل التدقيق."
              : "الحظر يمنع إنشاء عقود جديدة ولا يحذف السجل أو يمنع تحصيل الأقساط القائمة."}
          </p>
          <TextareaField
            label="السبب (إلزامي)"
            placeholder="اكتب سبب الإجراء"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error}
            maxLength={300}
            className="w-full"
          />
          <Button className="w-full md:w-65" loading={pending} loadingText="جارٍ الحفظ…" onClick={confirm}>
            {blocked ? "تأكيد إلغاء الحظر" : "تأكيد الحظر"}
          </Button>
          <Button variant="ghost" className="w-full md:w-65" disabled={pending} onClick={close}>
            إغلاق
          </Button>
        </div>
      </dialog>
    </>
  );
}
