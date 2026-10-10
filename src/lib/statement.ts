import type { StatementEntryType, StatementInstallmentFilter } from "@/server/finance/statement";

export const entryTypeLabels: Record<StatementEntryType, string> = {
  sale: "بيع بالتقسيط",
  fee: "رسوم",
  down_payment: "مقدم",
  payment: "سداد قسط",
  reversal: "عكس دفعة",
  settlement: "تسوية مبكرة",
  discount: "خصم (إعفاء عائد)",
};

export const entryStatusLabels = { posted: "مُرحّلة", reversed: "معكوسة" } as const;

export const installmentFilterLabels: Record<StatementInstallmentFilter, string> = {
  paid: "مدفوعة",
  partial: "مدفوعة جزئيًا",
  unpaid: "غير مدفوعة",
  overdue: "متأخرة",
};
