"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DetailList, Notice } from "@/components/page/blocks";
import { Panel } from "@/components/page/Panel";
import { Button, ButtonLink, Icon, SelectField, TextField, TextareaField } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/payments";
import type { SettlementPreview } from "@/server/contracts/settlement";
import type { PaymentMethod } from "@/server/db/schema";
import { settleContractAction } from "../../actions";

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[];
const money = (p: number) => <span className="num">{formatAmount(p)}</span>;

/** Figma "settlement" (breakdown and reason) then "settlement-confirm" (payment and password). */
export function SettlementForm({ quote, canSettle }: { quote: SettlementPreview; canSettle: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"review" | "confirm">("review");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const code = quote.contract.code;

  const review = () => {
    if (reason.trim().length < 3) {
      setErrors({ reason: "اذكر سبب التسوية" });
      return;
    }
    setErrors({});
    setStep("confirm");
    window.scrollTo({ top: 0 });
  };

  const settle = () =>
    startTransition(async () => {
      const result = await settleContractAction(code, {
        expectedAmount: quote.amount,
        reason,
        paymentMethod: method,
        paymentReference: reference,
        password,
      });
      if (result.ok) {
        router.push(`/contracts/${code}`);
        return;
      }
      setPassword("");
      setErrors(result.fieldErrors ?? {});
      setError(result.fieldErrors ? undefined : result.error);
      if (result.fieldErrors?.reason) setStep("review");
    });

  if (step === "review") {
    return (
      <>
        <Panel title="تفصيل مبلغ التسوية">
          <DetailList
            items={[
              { label: "أصل متبقٍ", value: money(quote.remainingPrincipal) },
              { label: "عائد مستحق حتى اليوم", value: money(quote.accruedProfit) },
              { label: "عائد مستقبلي", value: money(quote.futureProfit) },
              { label: "العائد المستقبلي المعفى", value: <span className="num">−{formatAmount(quote.futureProfit)}</span> },
              { label: "رسوم قائمة", value: money(quote.outstandingFees) },
              { label: "المبلغ النهائي", value: <span className="num font-bold text-navy">{formatAmount(quote.amount)}</span> },
            ]}
          />
        </Panel>
        <TextField label="سياسة التسوية" value={quote.policy} readOnly disabled />
        <TextareaField
          label="سبب التسوية"
          placeholder="مثال: طلب العميل السداد المبكر"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          maxLength={300}
        />
        <Notice tone="warning">بعد استلام المبلغ يُغلق العقد كتسوية مبكرة، وتُلغى الأقساط المستقبلية بسبب التسوية؛ لا تُسجل كمدفوعة.</Notice>
        {!canSettle && <Notice>تنفيذ التسوية متاح لصاحب الحساب والمدير فقط. هذه معاينة للمبلغ.</Notice>}
        <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-40">
          <ButtonLink href={`/contracts/${code}`} variant="outline" startIcon={<Icon name="arrow" className="rotate-180" />}>
            رجوع للعقد
          </ButtonLink>
          {canSettle && <Button onClick={review}>مراجعة وتأكيد</Button>}
        </div>
      </>
    );
  }

  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}
      <Notice tone="warning">لن تكتمل التسوية إلا بعد تسجيل استلام المبلغ.</Notice>
      <Panel title="تأكيد نهائي">
        <DetailList
          items={[
            { label: "العقد", value: <span className="num">{code}</span> },
            { label: "المبلغ المطلوب", value: money(quote.amount) },
            { label: "العائد المعفى", value: money(quote.futureProfit) },
            { label: "النتيجة", value: "تسوية مبكرة + إلغاء الأقساط المستقبلية" },
          ]}
        />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="وسيلة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} error={errors.paymentMethod}>
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
          error={errors.paymentReference}
          maxLength={80}
          autoComplete="off"
        />
        <TextField
          label="تأكيد كلمة المرور"
          kind="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          className="md:col-span-2"
        />
      </div>
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1">
        <Button variant="ghost" className="md:w-40" disabled={pending} onClick={() => setStep("review")}>
          إلغاء
        </Button>
        <Button className="md:w-56" loading={pending} loadingText="جارٍ التسوية…" onClick={settle}>
          استلام وتأكيد التسوية
        </Button>
      </div>
    </>
  );
}
