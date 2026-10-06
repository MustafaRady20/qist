"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Notice } from "@/components/page/blocks";
import { Panel } from "@/components/page/Panel";
import { Button, ButtonLink, DateField, TextField, TextareaField } from "@/components/ui";
import { saveRuleAction, type RuleFormState } from "./actions";

export type RuleFormValues = {
  key: string;
  version: number;
  name: string;
  annualRateBp: number;
  minTermMonths: number;
  maxTermMonths: number;
  minDownPaymentBp: number;
  settlementPolicy: string | null;
  allowedCategories: string | null;
};

/** New plan, or — with `rule` — a new version of an existing plan. */
export function RuleForm({ rule, today }: { rule?: RuleFormValues; /** Today in Cairo (YYYY-MM-DD). */ today: string }) {
  const router = useRouter();
  const [state, setState] = useState<RuleFormState>({});
  const [pending, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveRuleAction(rule?.key ?? null, form);
      if (result.saved) router.push("/settings");
      else {
        setState(result);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {rule && (
        <Notice>
          الحفظ ينشئ الإصدار <span className="num">{rule.version + 1}</span> ويوقف الإصدار <span className="num">{rule.version}</span> للعقود الجديدة.
          العقود القائمة تبقى على إصدارها دون إعادة حساب.
        </Notice>
      )}
      <Panel title="بيانات الخطة">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="اسم الخطة" name="name" defaultValue={rule?.name} error={errors.name} maxLength={80} autoComplete="off" required autoFocus={!rule} className="md:col-span-2" />
          <TextField label="النسبة السنوية الثابتة" name="annualRateBp" kind="percentage" placeholder="40" defaultValue={rule ? String(rule.annualRateBp / 100) : ""} error={errors.annualRateBp} autoComplete="off" required />
          <TextField label="الحد الأدنى للمقدم" name="minDownPaymentBp" kind="percentage" placeholder="0" defaultValue={rule ? String(rule.minDownPaymentBp / 100) : "0"} error={errors.minDownPaymentBp} autoComplete="off" />
          <TextField label="أقل مدة (بالأشهر)" name="minTermMonths" kind="currency" inputMode="numeric" defaultValue={String(rule?.minTermMonths ?? 6)} error={errors.minTermMonths} autoComplete="off" required />
          <TextField label="أقصى مدة (بالأشهر)" name="maxTermMonths" kind="currency" inputMode="numeric" defaultValue={String(rule?.maxTermMonths ?? 24)} error={errors.maxTermMonths} autoComplete="off" required />
        </div>
      </Panel>
      <Panel title="السريان والسياسات">
        <div className="grid gap-4 md:grid-cols-2">
          <DateField label="تاريخ بدء السريان" name="effectiveFrom" defaultValue={today} error={errors.effectiveFrom} />
          <DateField label="تاريخ الانتهاء (اختياري)" name="effectiveTo" placeholder="بدون تاريخ انتهاء" min={today} error={errors.effectiveTo} />
          <TextField label="سياسة التسوية المبكرة (اختياري)" name="settlementPolicy" defaultValue={rule?.settlementPolicy ?? ""} error={errors.settlementPolicy} maxLength={200} autoComplete="off" />
          <TextField label="الفئات المسموحة (اختياري)" name="allowedCategories" defaultValue={rule?.allowedCategories ?? ""} error={errors.allowedCategories} maxLength={200} autoComplete="off" />
          <TextareaField
            label={rule ? "سبب التعديل (إلزامي)" : "ملاحظة (اختياري)"}
            name="changeReason"
            placeholder={rule ? "مثال: تحديث النسبة السنوية" : undefined}
            error={errors.changeReason}
            maxLength={300}
            className="md:col-span-2"
          />
        </div>
      </Panel>
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-40">
        <ButtonLink href="/settings" variant="ghost">
          إلغاء
        </ButtonLink>
        <Button type="submit" loading={pending} loadingText="جارٍ الحفظ…">
          {rule ? "حفظ كإصدار جديد" : "حفظ الخطة"}
        </Button>
      </div>
    </form>
  );
}
