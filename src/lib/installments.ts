import type { ProfitBase } from "@/server/db/schema";
import { customAmountsIssue } from "@/server/finance/schedule";
import { formatAmount } from "./format";

export const profitBaseLabels: Record<ProfitBase, string> = {
  principal: "السعر بعد خصم المقدم",
  purchase_cost: "كامل سعر المنتج",
};

/** Message for manual installment amounts that cannot add up to the contract total; null when they can. */
export function customAmountsError(total: number, count: number, amounts: number[]): string | null {
  const issue = customAmountsIssue(total, count, amounts);
  if (!issue) return null;
  const totalText = formatAmount(total);
  if (issue.kind === "exceeds") return `المبالغ اليدوية لا تترك رصيدًا للأقساط المحسوبة تلقائيًا. إجمالي الأقساط ${totalText} جنيه.`;
  return issue.difference > 0
    ? `كل الأقساط محددة يدويًا ومجموعها أقل من إجمالي الأقساط (${totalText}) بمبلغ ${formatAmount(issue.difference)} جنيه. عدّل المبالغ أو اترك قسطًا فارغًا ليُحسب تلقائيًا.`
    : `كل الأقساط محددة يدويًا ومجموعها أكبر من إجمالي الأقساط (${totalText}) بمبلغ ${formatAmount(-issue.difference)} جنيه.`;
}
