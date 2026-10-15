"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Notice } from "@/components/page/blocks";
import { Button, ButtonLink, DateField, SelectField, TextField, TextareaField } from "@/components/ui";
import { formatAmount, parseAmount } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/payments";
import type { PaymentMethod } from "@/server/db/schema";
import { recordPaymentAction } from "../actions";

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[];

export function PaymentForm({
  contractCode,
  customerCode,
  outstanding,
  suggested,
  today,
  minDate,
}: {
  contractCode: string;
  customerCode: string;
  outstanding: number;
  /** What is left on the next installment. */
  suggested: number;
  today: string;
  minDate: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState((suggested / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // One key per form: a double click or a retry after a lost response never records the money twice.
  const key = useRef<string>(undefined);

  const submit = () => {
    const piastres = parseAmount(amount);
    if (!piastres) {
      setErrors({ amount: "أدخل مبلغًا صحيحًا" });
      return;
    }
    key.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await recordPaymentAction({
        contract: contractCode,
        amount: piastres,
        method,
        reference,
        paidOn,
        note,
        idempotencyKey: key.current,
      });
      if (result.ok) {
        router.push(`/customers/${customerCode}/statement?contract=${contractCode}`);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setError(result.fieldErrors ? undefined : result.error);
    });
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="المبلغ المستلم (جنيه)"
          kind="currency"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          autoComplete="off"
        />
        <DateField label="تاريخ الاستلام" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} min={minDate} max={today} error={errors.paidOn} />
        <SelectField label="وسيلة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} error={errors.method}>
          {methods.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabels[m]}
            </option>
          ))}
        </SelectField>
        <TextField
          label={method === "cash" ? "مرجع الدفع (اختياري)" : "مرجع الدفع"}
          placeholder="TRX-92815"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={errors.reference}
          maxLength={80}
          autoComplete="off"
        />
        <TextareaField
          label="ملاحظة (اختياري)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
          maxLength={300}
          className="md:col-span-2"
        />
      </div>
      <Notice>
        يُوزَّع المبلغ على الأقساط من الأقدم إلى الأحدث، ولا يُقبل مبلغ أكبر من المتبقي على العقد (<span className="num">{formatAmount(outstanding)}</span> جنيه).
      </Notice>
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1">
        <ButtonLink href={`/contracts/${contractCode}`} variant="ghost" className="md:w-40">
          إلغاء
        </ButtonLink>
        <Button type="submit" className="md:w-56" loading={pending} loadingText="جارٍ التسجيل…">
          تسجيل الدفعة
        </Button>
      </div>
    </form>
  );
}
