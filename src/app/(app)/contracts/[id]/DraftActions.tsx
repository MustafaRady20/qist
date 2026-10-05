"use client";

import { useRef, useState, useTransition } from "react";
import { Notice } from "@/components/page/blocks";
import { Button, Icon, TextareaField } from "@/components/ui";
import { cancelDraftAction, confirmDraftAction } from "../actions";

/** Confirm / cancel for a draft. Cancelling follows the Figma "cancel-contract" dialog. */
export function DraftActions({ code, canConfirm }: { code: string; canConfirm: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const close = () => {
    dialog.current?.close();
    setReason("");
    setError(undefined);
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmDraftAction(code);
      setConfirmError(result.ok ? undefined : result.error);
    });

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelDraftAction(code, reason);
      if (result.ok) close();
      else setError(result.error);
    });

  return (
    <>
      {canConfirm && (
        <Button loading={pending} loadingText="جارٍ التأكيد…" onClick={confirm}>
          تأكيد العقد
        </Button>
      )}
      <Button variant="outline" disabled={pending} onClick={() => dialog.current?.showModal()}>
        إلغاء المسودة
      </Button>
      {confirmError && (
        <div className="w-full! basis-full">
          <Notice tone="danger">{confirmError}</Notice>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="cancel-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!pending) close();
        }}
        // `!`: the dialog sits inside ActionBar, which sizes its direct children.
        className="m-auto w-[min(600px,calc(100vw_-_32px))]! rounded-modal bg-surface p-6 text-text backdrop:bg-navy/40 md:p-10"
      >
        <div className="flex flex-col items-start gap-6">
          <Icon name="alert" className="text-dangerText" />
          <h2 id="cancel-title" className="text-h2 text-navy">
            تأكيد إلغاء العقد
          </h2>
          <p className="text-body text-secondary">المسودة لم تُنشئ أقساطًا ولا أثر مالي لها. تبقى محفوظة في السجل بحالة «ملغي» مع سبب الإلغاء.</p>
          <TextareaField
            label="السبب (إلزامي)"
            placeholder="اكتب سبب الإجراء"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error}
            maxLength={300}
            className="w-full"
          />
          <Button variant="danger" className="w-full md:w-65" loading={pending} loadingText="جارٍ الإلغاء…" onClick={cancel}>
            إلغاء العقد
          </Button>
          <Button variant="ghost" className="w-full md:w-65" disabled={pending} onClick={close}>
            إغلاق
          </Button>
        </div>
      </dialog>
    </>
  );
}
