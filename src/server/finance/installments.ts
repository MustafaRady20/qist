/** Installment state and payment allocation. Pure: no database, integer piastres, ISO dates. */

export type InstallmentStatus = "paid" | "waived" | "partial" | "overdue" | "due" | "upcoming";

export function installmentStatus(
  i: { amount: number; paidAmount: number; waivedAmount?: number; dueDate: string },
  today: string,
): InstallmentStatus {
  if (i.paidAmount >= i.amount) return "paid";
  // Closed by an early settlement with part of it forgiven.
  if (i.paidAmount + (i.waivedAmount ?? 0) >= i.amount) return "waived";
  if (i.paidAmount > 0) return "partial";
  if (i.dueDate < today) return "overdue";
  if (i.dueDate === today) return "due";
  return "upcoming";
}

export type OpenInstallment = { id: string; seq: number; amount: number; paidAmount: number; waivedAmount: number };

/**
 * Spreads a received amount over a contract's installments, oldest first: an
 * installment is completed before the next one is touched, so a partial payment
 * reduces the earliest open installment. Throws when the amount is more than
 * what is still owed, since the surplus would have nowhere to go.
 */
export function allocatePayment(rows: OpenInstallment[], amount: number): { installmentId: string; seq: number; amount: number }[] {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new RangeError("amount must be a positive integer");
  const out: { installmentId: string; seq: number; amount: number }[] = [];
  let left = amount;
  for (const r of [...rows].sort((a, b) => a.seq - b.seq)) {
    if (left === 0) break;
    const open = r.amount - r.paidAmount - r.waivedAmount;
    if (open <= 0) continue;
    const part = Math.min(open, left);
    out.push({ installmentId: r.id, seq: r.seq, amount: part });
    left -= part;
  }
  if (left > 0) throw new RangeError("amount exceeds the outstanding balance");
  return out;
}
