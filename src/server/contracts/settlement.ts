import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { verifyPassword } from "@/server/auth/password";
import { db, type Tx } from "@/server/db";
import { contracts, contractSettlements, customers, financeRules, installments, paymentMethod, users } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { quoteSettlement, type SettlementQuote } from "@/server/finance/settlement";
import { todayInCairo } from "@/server/time";
import { moneySchema, optionalText } from "@/server/validation";
import { omit } from "@/lib/omit";
import { leaveGroup } from "./groups";

const DEFAULT_POLICY = "إعفاء العائد المستقبلي";

function byIdOrCode(idOrCode: string) {
  return /^[0-9a-f-]{36}$/i.test(idOrCode) ? eq(contracts.id, idOrCode) : eq(contracts.code, idOrCode.toUpperCase());
}

async function loadQuote(tx: Tx | typeof db, idOrCode: string, today: string, lock: boolean) {
  const query = tx.select().from(contracts).where(byIdOrCode(idOrCode));
  const [contract] = lock ? await query.for("update") : await query;
  if (!contract) throw notFound("العقد");
  if (contract.status !== "active") throw new AppError("invalid_state", "التسوية المبكرة متاحة للعقود النشطة فقط");

  const rows = await tx.select().from(installments).where(eq(installments.contractId, contract.id)).orderBy(asc(installments.seq));
  const quote = quoteSettlement(rows, today);
  if (quote.amount === 0) throw new AppError("invalid_state", "لا يوجد رصيد قائم على هذا العقد");

  const [rule] = await tx
    .select({ version: financeRules.version, settlementPolicy: financeRules.settlementPolicy })
    .from(financeRules)
    .where(eq(financeRules.id, contract.financeRuleId));
  const policy = `${rule?.settlementPolicy || DEFAULT_POLICY} • الإصدار ${rule?.version ?? 1}`;
  return { contract, rows, quote, policy };
}

export type SettlementPreview = Omit<SettlementQuote, "allocations"> & {
  contract: { id: string; code: string };
  customer: { code: string; fullName: string };
  policy: string;
  /** The date the figures were computed for (Cairo); they change when an installment falls due. */
  asOf: string;
};

/** Breakdown of what settling the contract today would cost. Nothing is saved. */
export async function getSettlementQuote(idOrCode: string): Promise<SettlementPreview> {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const { contract, quote, policy } = await loadQuote(db, idOrCode, today, false);
  const [customer] = await db
    .select({ code: customers.code, fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.id, contract.customerId));
  return { ...omit(quote, ["allocations"]), contract: { id: contract.id, code: contract.code }, customer, policy, asOf: today };
}

export const settlementInputSchema = z
  .object({
    /** The amount the user reviewed; the settlement is refused if it no longer matches. */
    expectedAmount: moneySchema,
    reason: z.string().trim().min(3, { error: "اذكر سبب التسوية" }).max(300),
    paymentMethod: z.enum(paymentMethod.enumValues, { error: "اختر وسيلة الدفع" }),
    paymentReference: optionalText(80),
    /** The acting user's own password, re-entered to confirm. */
    password: z.string().min(1, { error: "أدخل كلمة المرور للتأكيد" }),
  })
  .refine((v) => v.paymentMethod === "cash" || !!v.paymentReference, { error: "أدخل مرجع الدفع", path: ["paymentReference"] });

/**
 * Receives the settlement amount and closes the contract as "تسوية مبكرة".
 * Open installments are paid up to their principal, fees and due profit; the
 * future profit is waived (cancelled, not recorded as paid).
 */
export async function settleContract(idOrCode: string, input: z.input<typeof settlementInputSchema>) {
  const actor = await requirePermission("contracts:settle");
  const data = settlementInputSchema.parse(input);

  const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!account || !(await verifyPassword(account.passwordHash, data.password))) {
    throw new AppError("validation", "كلمة المرور غير صحيحة", { fieldErrors: { password: "كلمة المرور غير صحيحة" } });
  }

  const today = todayInCairo();
  return db.transaction(async (tx) => {
    const { contract, rows, quote, policy } = await loadQuote(tx, idOrCode, today, true);
    if (quote.amount !== data.expectedAmount) {
      throw new AppError("conflict", "تغيّر مبلغ التسوية منذ المعاينة. راجع التفصيل ثم أكّد من جديد.", { amount: quote.amount });
    }

    for (const a of quote.allocations) {
      const row = rows.find((r) => r.seq === a.seq)!;
      await tx
        .update(installments)
        .set({ paidAmount: row.paidAmount + a.pay, waivedAmount: a.waive })
        .where(and(eq(installments.contractId, contract.id), eq(installments.seq, a.seq)));
    }

    const [settlement] = await tx
      .insert(contractSettlements)
      .values({
        contractId: contract.id,
        remainingPrincipal: quote.remainingPrincipal,
        accruedProfit: quote.accruedProfit,
        waivedProfit: quote.futureProfit,
        outstandingFees: quote.outstandingFees,
        amount: quote.amount,
        policy,
        reason: data.reason,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference ?? null,
        settledOn: today,
        settledBy: actor.id,
      })
      .returning();

    await tx.update(contracts).set({ status: "settled", groupId: null }).where(eq(contracts.id, contract.id));
    if (contract.groupId) await leaveGroup(tx, contract.groupId, actor.id);

    await recordAudit(
      {
        actorId: actor.id,
        action: "تسوية مبكرة",
        entityType: "contract",
        entityId: contract.id,
        ref: contract.code,
        before: { status: "active" },
        after: {
          status: "settled",
          amount: quote.amount,
          waivedProfit: quote.futureProfit,
          paymentMethod: data.paymentMethod,
          paymentReference: data.paymentReference ?? null,
          reason: data.reason,
        },
      },
      tx,
    );
    return { contract: { id: contract.id, code: contract.code }, settlement };
  });
}
