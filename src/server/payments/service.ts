import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { leaveGroup } from "@/server/contracts/groups";
import { db, type Tx } from "@/server/db";
import { contracts, installments, paymentAllocations, paymentMethod, payments, type Payment, type PaymentKind, type PaymentMethod } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { allocatePayment } from "@/server/finance/installments";
import { todayInCairo } from "@/server/time";
import { isoDateSchema, moneySchema, optionalText, PAGE_SIZE } from "@/server/validation";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export const paymentInputSchema = z
  .object({
    /** Contract UUID or code (CT-1024). */
    contract: z.string().trim().min(1, { error: "اختر العقد" }),
    amount: moneySchema.min(1, { error: "أدخل مبلغ الدفعة" }),
    method: z.enum(paymentMethod.enumValues, { error: "اختر وسيلة الدفع" }),
    reference: optionalText(80),
    /** Date the money was received; defaults to today (Cairo). */
    paidOn: isoDateSchema.optional(),
    note: optionalText(300),
    /** Generated once per form; a resubmission returns the payment already recorded. */
    idempotencyKey: z.uuid().optional(),
  })
  .refine((v) => v.method === "cash" || !!v.reference, { error: "أدخل مرجع الدفع", path: ["reference"] });
export type PaymentInput = z.input<typeof paymentInputSchema>;

async function lockContract(tx: Tx, idOrCode: string) {
  const [contract] = await tx
    .select()
    .from(contracts)
    .where(isUuid(idOrCode) ? eq(contracts.id, idOrCode) : eq(contracts.code, idOrCode.toUpperCase()))
    .for("update");
  if (!contract) throw notFound("العقد");
  return contract;
}

/**
 * Receives money on an active contract and applies it to its installments,
 * oldest first. The whole amount must fit what is still owed, so nothing is
 * left unapplied. A fully paid contract is closed as "مكتمل".
 */
export async function recordPayment(input: PaymentInput): Promise<{ payment: Payment; duplicate: boolean }> {
  const actor = await requirePermission("payments:write");
  const data = paymentInputSchema.parse(input);
  const today = todayInCairo();
  const paidOn = data.paidOn ?? today;

  return db.transaction(async (tx) => {
    // The contract lock serializes payments on it, so a double submit waits here and then finds the first one.
    const contract = await lockContract(tx, data.contract);
    if (data.idempotencyKey) {
      const [existing] = await tx.select().from(payments).where(eq(payments.idempotencyKey, data.idempotencyKey));
      if (existing) return { payment: existing, duplicate: true };
    }
    if (contract.status !== "active") throw new AppError("invalid_state", "تسجيل الدفعات متاح للعقود النشطة فقط");

    const confirmedOn = todayInCairo(contract.confirmedAt ?? contract.createdAt);
    if (paidOn > today || paidOn < confirmedOn) {
      const message = "تاريخ الدفعة يجب أن يكون بين تاريخ العقد واليوم";
      throw new AppError("validation", message, { fieldErrors: { paidOn: message } });
    }

    const rows = await tx.select().from(installments).where(eq(installments.contractId, contract.id)).orderBy(asc(installments.seq));
    const outstanding = rows.reduce((total, r) => total + r.amount - r.paidAmount - r.waivedAmount, 0);
    if (data.amount > outstanding) {
      const message = `المبلغ أكبر من المتبقي على العقد (${(outstanding / 100).toFixed(2)} جنيه)`;
      throw new AppError("validation", message, { fieldErrors: { amount: message }, outstanding });
    }

    const allocations = allocatePayment(rows, data.amount);
    const [payment] = await tx
      .insert(payments)
      .values({
        contractId: contract.id,
        kind: "payment",
        amount: data.amount,
        method: data.method,
        reference: data.reference ?? null,
        paidOn,
        note: data.note ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        receivedBy: actor.id,
      })
      .returning();
    await tx.insert(paymentAllocations).values(allocations.map((a) => ({ paymentId: payment.id, installmentId: a.installmentId, amount: a.amount })));
    for (const a of allocations) {
      await tx
        .update(installments)
        .set({ paidAmount: sql`${installments.paidAmount} + ${a.amount}` })
        .where(eq(installments.id, a.installmentId));
    }

    const completed = data.amount === outstanding;
    if (completed) {
      await tx.update(contracts).set({ status: "completed", groupId: null }).where(eq(contracts.id, contract.id));
      if (contract.groupId) await leaveGroup(tx, contract.groupId, actor.id);
    }

    await recordAudit(
      {
        actorId: actor.id,
        action: "تسجيل دفعة",
        entityType: "contract",
        entityId: contract.id,
        ref: contract.code,
        before: { outstanding },
        after: {
          payment: payment.code,
          amount: data.amount,
          method: data.method,
          reference: data.reference ?? null,
          paidOn,
          installments: allocations.map((a) => ({ seq: a.seq, amount: a.amount })),
          outstanding: outstanding - data.amount,
          ...(completed && { status: "completed" }),
        },
      },
      tx,
    );
    return { payment, duplicate: false };
  });
}

const reasonSchema = z.string().trim().min(3, { error: "اذكر سبب عكس الدفعة" }).max(300);

/**
 * Cancels a recorded payment with a reversing entry: the payment row stays, a
 * reversal row is added, and the money is taken back off the installments it
 * was applied to. A contract the payment had completed becomes active again.
 */
export async function reversePayment(idOrCode: string, reason: string): Promise<{ reversal: Payment }> {
  const actor = await requirePermission("payments:reverse");
  const why = reasonSchema.parse(reason);
  const today = todayInCairo();

  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: payments.id, contractId: payments.contractId })
      .from(payments)
      .where(isUuid(idOrCode) ? eq(payments.id, idOrCode) : eq(payments.code, idOrCode.toUpperCase()));
    if (!found) throw notFound("الدفعة");
    const contract = await lockContract(tx, found.contractId);
    // Re-read under the contract lock.
    const [payment] = await tx.select().from(payments).where(eq(payments.id, found.id));
    if (payment.kind !== "payment") throw new AppError("invalid_state", "لا يمكن عكس قيد عكسي");
    const [already] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.reversesId, payment.id));
    if (already) throw new AppError("conflict", "هذه الدفعة معكوسة من قبل");
    if (contract.status !== "active" && contract.status !== "completed") {
      throw new AppError("invalid_state", "لا يمكن عكس دفعة على عقد أُغلق بالتسوية المبكرة");
    }

    const allocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));
    for (const a of allocations) {
      await tx
        .update(installments)
        .set({ paidAmount: sql`${installments.paidAmount} - ${a.amount}` })
        .where(and(eq(installments.id, a.installmentId), eq(installments.contractId, contract.id)));
    }
    const [reversal] = await tx
      .insert(payments)
      .values({
        contractId: contract.id,
        kind: "reversal",
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        paidOn: today,
        note: why,
        reversesId: payment.id,
        receivedBy: actor.id,
      })
      .returning();
    if (contract.status === "completed") await tx.update(contracts).set({ status: "active" }).where(eq(contracts.id, contract.id));

    await recordAudit(
      {
        actorId: actor.id,
        action: "عكس دفعة",
        entityType: "contract",
        entityId: contract.id,
        ref: contract.code,
        before: { payment: payment.code, amount: payment.amount, paidOn: payment.paidOn, status: contract.status },
        after: { reversal: reversal.code, reason: why, status: "active" },
      },
      tx,
    );
    return { reversal };
  });
}

export type PaymentListItem = {
  id: string;
  code: string;
  kind: PaymentKind;
  contractCode: string;
  customerName: string;
  customerCode: string;
  paidOn: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  reversed: boolean;
};

/** Recorded payments and reversals, newest first. */
export async function listPayments(params: { q?: string; page?: number }) {
  await requirePermission("contracts:read");
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : undefined;
  const where: SQL = like
    ? sql`(p.code ilike ${like} or p.reference ilike ${like} or c.code ilike ${like} or cu.full_name ilike ${like} or cu.code ilike ${like})`
    : sql`true`;

  const rows = await db.execute<{
    id: string;
    code: string;
    kind: PaymentKind;
    contract_code: string;
    customer_name: string;
    customer_code: string;
    paid_on: string;
    amount: string;
    method: PaymentMethod;
    reference: string | null;
    reversed: boolean;
    total: string;
  }>(sql`
    select p.id, p.code, p.kind, p.paid_on, p.amount, p.method, p.reference,
      c.code as contract_code, cu.full_name as customer_name, cu.code as customer_code,
      exists (select 1 from payments r where r.reverses_id = p.id) as reversed,
      count(*) over () as total
    from payments p
    join contracts c on c.id = p.contract_id
    join customers cu on cu.id = c.customer_id
    where ${where}
    order by p.paid_on desc, p.created_at desc
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);

  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    items: rows.map(
      (r): PaymentListItem => ({
        id: r.id,
        code: r.code,
        kind: r.kind,
        contractCode: r.contract_code,
        customerName: r.customer_name,
        customerCode: r.customer_code,
        paidOn: r.paid_on,
        amount: Number(r.amount),
        method: r.method,
        reference: r.reference,
        reversed: r.reversed,
      }),
    ),
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
