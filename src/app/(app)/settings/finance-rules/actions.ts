"use server";

import { refresh } from "next/cache";
import { ZodError, type z } from "zod";
import { AppError } from "@/server/errors";
import { createRuleVersion, getLatestRule, setRuleActive, type ruleVersionSchema } from "@/server/finance-rules/service";
import { fieldErrors } from "@/server/http";

export type RuleFormState = { saved?: true; error?: string; fieldErrors?: Record<string, string> };

/** "40" / "12.5" (percent) → basis points; null when it is not a valid percentage. */
function percentToBp(text: string): number | null {
  const clean = text.trim().replace(/%$/, "");
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Math.round(Number(clean) * 100) : null;
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text) : null;
}

/** Form values → service input. The form takes percentages; the service wants basis points. */
function readForm(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  const errors: Record<string, string> = {};

  const annualRateBp = percentToBp(text("annualRateBp"));
  if (annualRateBp === null) errors.annualRateBp = "أدخل النسبة السنوية بالأرقام (مثال: 40)";
  const minDownPaymentBp = percentToBp(text("minDownPaymentBp") || "0");
  if (minDownPaymentBp === null) errors.minDownPaymentBp = "أدخل نسبة المقدم بالأرقام (مثال: 10)";
  else if (minDownPaymentBp >= 10_000) errors.minDownPaymentBp = "نسبة المقدم يجب أن تكون أقل من 100%";
  const minTermMonths = wholeNumber(text("minTermMonths"));
  if (minTermMonths === null) errors.minTermMonths = "أدخل عدد الأشهر";
  const maxTermMonths = wholeNumber(text("maxTermMonths"));
  if (maxTermMonths === null) errors.maxTermMonths = "أدخل عدد الأشهر";

  const input = {
    name: text("name"),
    annualRateBp,
    minTermMonths,
    maxTermMonths,
    minDownPaymentBp,
    settlementPolicy: text("settlementPolicy"),
    allowedCategories: text("allowedCategories"),
    effectiveFrom: text("effectiveFrom"),
    effectiveTo: text("effectiveTo") || null,
    changeReason: text("changeReason"),
  };
  return { input, errors };
}

function toState(error: unknown): RuleFormState {
  if (error instanceof ZodError) {
    const fields = fieldErrors(error);
    return { error: "راجع بيانات القاعدة", fieldErrors: fields };
  }
  if (error instanceof AppError) return { error: error.message };
  throw error;
}

/**
 * Creates a plan, or a new version of the plan `key`. Existing contracts keep
 * the version they were created with. Permissions are checked by the service.
 */
export async function saveRuleAction(key: string | null, form: FormData): Promise<RuleFormState> {
  const { input, errors } = readForm(form);
  if (Object.keys(errors).length) return { error: "راجع بيانات القاعدة", fieldErrors: errors };
  try {
    // Checks the plan exists, so a mistyped URL cannot start a new plan under that key.
    const ruleKey = key === null ? `plan-${crypto.randomUUID().slice(0, 8)}` : (await getLatestRule(key)).key;
    await createRuleVersion({
      ...input,
      key: ruleKey,
      changeReason: key === null && !input.changeReason.trim() ? "إضافة قاعدة جديدة" : input.changeReason,
    } as z.input<typeof ruleVersionSchema>);
    return { saved: true };
  } catch (error) {
    return toState(error);
  }
}

export async function setRuleActiveAction(key: string, active: boolean): Promise<{ error?: string }> {
  try {
    await setRuleActive(key, active);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refresh();
  return {};
}
