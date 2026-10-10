"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Icon, TextareaField } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { reversePaymentAction } from "../../../payments/actions";

/** Cancels a recorded payment with a reversing entry, after a reason is given. */
export function ReversePaymentButton({ paymentId, code, amount }: { paymentId: string; code: string; amount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const close = () => {
    dialog.current?.close();
    setReason("");
    setError(undefined);
  };

  const reverse = () =>
    startTransition(async () => {
      const result = await reversePaymentAction(paymentId, reason);
      if (result.ok) close();
      else setError(result.error);
    });

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="text-label cursor-pointer text-dangerText underline-offset-4 hover:underline print:hidden"
      >
        عكس
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`reverse-${paymentId}`}
        onCancel={(e) => {
          e.preventDefault();
          if (!pending) close();
        }}
        className="m-auto w-[min(600px,calc(100vw_-_32px))] rounded-modal bg-surface p-6 text-start text-text backdrop:bg-navy/40 md:p-10"
      >
        <div className="flex flex-col items-start gap-6">
          <Icon name="alert" className="text-dangerText" />
          <h2 id={`reverse-${paymentId}`} className="text-h2 text-navy">
            عكس الدفعة <span className="num">{code}</span>
          </h2>
          <p className="text-body text-secondary">
            يُضاف قيد عكسي بمبلغ <span className="num">{formatAmount(amount)}</span> جنيه ويعود المبلغ مستحقًا على الأقساط التي سُدد بها. الدفعة الأصلية
            تبقى في الكشف بحالة «معكوسة».
          </p>
          <TextareaField
            label="السبب (إلزامي)"
            placeholder="مثال: تحويل مرتجع، دفعة مسجلة بالخطأ"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error}
            maxLength={300}
            className="w-full"
          />
          <Button variant="danger" className="w-full md:w-65" loading={pending} loadingText="جارٍ العكس…" onClick={reverse}>
            عكس الدفعة
          </Button>
          <Button variant="ghost" className="w-full md:w-65" disabled={pending} onClick={close}>
            إغلاق
          </Button>
        </div>
      </dialog>
    </>
  );
}
