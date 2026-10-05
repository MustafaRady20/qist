import { matches } from "@/lib/search";

/** Demo data mirroring Figma "payments" (15:2). Money in piastres. */

export type PaymentRow = {
  ref: string;
  customer: string;
  date: string;
  received: number;
  applied: number;
  /** Unapplied surplus kept as customer credit. */
  credit: number;
  method: "نقدي" | "تحويل" | "بطاقة";
};

const EGP = 100;

const rows: PaymentRow[] = [
  { ref: "PAY-0841", customer: "أحمد محمد", date: "2026-09-27", received: 3_500 * EGP, applied: 3_500 * EGP, credit: 0, method: "نقدي" },
  { ref: "PAY-0840", customer: "منى خالد", date: "2026-09-26", received: 1_500 * EGP, applied: 1_500 * EGP, credit: 0, method: "تحويل" },
  { ref: "PAY-0839", customer: "سارة أحمد", date: "2026-09-26", received: 4_000 * EGP, applied: 3_500 * EGP, credit: 500 * EGP, method: "بطاقة" },
];

export async function listPayments({ q }: { q?: string }) {
  return rows.filter((r) => matches(q, r.ref, r.customer));
}
