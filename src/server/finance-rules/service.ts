import "server-only";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { db, type Tx } from "@/server/db";
import { financeRules, type FinanceRule } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { todayInCairo } from "@/server/time";
import { isoDateSchema, optionalText } from "@/server/validation";

/** Latest version of every rule (Figma "settings" → قواعد التمويل). */
export async function listFinanceRules(): Promise<FinanceRule[]> {
  await requirePermission("finance-rules:read");
  return db
    .selectDistinctOn([financeRules.key])
    .from(financeRules)
    .orderBy(financeRules.key, desc(financeRules.version));
}

/** Every version of one rule (or of all rules), newest first (Figma "finance-versions"). */
export async function listRuleVersions(key?: string) {
  await requirePermission("finance-rules:read");
  return db
    .select()
    .from(financeRules)
    .where(key ? eq(financeRules.key, key) : undefined)
    .orderBy(financeRules.key, desc(financeRules.version));
}

/** Latest version of one rule, the one an edit starts from. */
export async function getLatestRule(key: string): Promise<FinanceRule> {
  await requirePermission("finance-rules:read");
  const [rule] = await db.select().from(financeRules).where(eq(financeRules.key, key)).orderBy(desc(financeRules.version)).limit(1);
  if (!rule) throw notFound("قاعدة التمويل");
  return rule;
}

/** Rules a new contract may use today. */
export async function listUsableRules(on = todayInCairo()) {
  await requirePermission("finance-rules:read");
  return db.select().from(financeRules).where(usableOn(on)).orderBy(financeRules.name);
}

function usableOn(date: string) {
  return and(
    eq(financeRules.isActive, true),
    lte(financeRules.effectiveFrom, date),
    or(isNull(financeRules.effectiveTo), gte(financeRules.effectiveTo, date)),
  );
}

/** Loads a rule version and checks it can be used for a new contract on `date`. */
export async function getUsableRule(id: string, date: string, tx: Tx | typeof db = db): Promise<FinanceRule> {
  const [rule] = await tx.select().from(financeRules).where(eq(financeRules.id, id)).limit(1);
  if (!rule) throw notFound("قاعدة التمويل");
  const [usable] = await tx.select({ id: financeRules.id }).from(financeRules).where(and(eq(financeRules.id, id), usableOn(date)));
  if (!usable) throw new AppError("invalid_state", `قاعدة التمويل "${rule.name} • v${rule.version}" غير سارية حاليًا`);
  return rule;
}

export const ruleVersionSchema = z
  .object({
    /** Existing key to version, or a new key for a brand-new rule. */
    key: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, { error: "معرّف القاعدة بأحرف إنجليزية صغيرة وأرقام" }),
    name: z.string().trim().min(2).max(80),
    annualRateBp: z.number().int().min(0).max(100_000),
    minTermMonths: z.number().int().min(1).max(120),
    maxTermMonths: z.number().int().min(1).max(120),
    minDownPaymentBp: z.number().int().min(0).max(10_000),
    settlementPolicy: optionalText(200),
    allowedCategories: optionalText(200),
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema.nullish(),
    changeReason: z.string().trim().min(3, { error: "اذكر سبب التغيير" }).max(300),
  })
  .refine((v) => v.maxTermMonths >= v.minTermMonths, { error: "المدة القصوى أقل من الدنيا", path: ["maxTermMonths"] })
  .refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, { error: "تاريخ الانتهاء قبل البداية", path: ["effectiveTo"] });

/**
 * "تعديل القاعدة ينشئ إصدارًا جديدًا": saving creates version N+1 and retires
 * earlier versions for new contracts. Existing contracts keep their version.
 */
export async function createRuleVersion(input: z.input<typeof ruleVersionSchema>) {
  const actor = await requirePermission("finance-rules:write");
  const data = ruleVersionSchema.parse(input);

  return db.transaction(async (tx) => {
    // Serialize concurrent edits of the same rule.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`finance_rule:${data.key}`}))`);
    const [latest] = await tx
      .select()
      .from(financeRules)
      .where(eq(financeRules.key, data.key))
      .orderBy(desc(financeRules.version))
      .limit(1);

    await tx.update(financeRules).set({ isActive: false }).where(eq(financeRules.key, data.key));
    const [created] = await tx
      .insert(financeRules)
      .values({ ...data, method: "flat", version: (latest?.version ?? 0) + 1, createdBy: actor.id })
      .returning();

    await recordAudit(
      {
        actorId: actor.id,
        action: latest ? "تعديل تمويل" : "إضافة قاعدة تمويل",
        entityType: "finance_rule",
        entityId: created.id,
        ref: latest ? `v${latest.version} → v${created.version}` : `${created.name} • v1`,
        before: latest ? ruleSummary(latest) : null,
        after: ruleSummary(created),
      },
      tx,
    );
    return created;
  });
}

/**
 * Stops a rule for new contracts, or brings its latest version back. Contracts
 * already on the rule are not affected.
 */
export async function setRuleActive(key: string, active: boolean) {
  const actor = await requirePermission("finance-rules:write");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`finance_rule:${key}`}))`);
    const [latest] = await tx.select().from(financeRules).where(eq(financeRules.key, key)).orderBy(desc(financeRules.version)).limit(1);
    if (!latest) throw notFound("قاعدة التمويل");
    if (latest.isActive === active) return latest;

    const [updated] = await tx.update(financeRules).set({ isActive: active }).where(eq(financeRules.id, latest.id)).returning();
    await recordAudit(
      {
        actorId: actor.id,
        action: active ? "تفعيل قاعدة تمويل" : "إيقاف قاعدة تمويل",
        entityType: "finance_rule",
        entityId: latest.id,
        ref: `${latest.name} • v${latest.version}`,
        before: { isActive: latest.isActive },
        after: { isActive: active },
      },
      tx,
    );
    return updated;
  });
}

function ruleSummary(r: FinanceRule) {
  return {
    name: r.name,
    annualRateBp: r.annualRateBp,
    term: [r.minTermMonths, r.maxTermMonths],
    minDownPaymentBp: r.minDownPaymentBp,
    effective: [r.effectiveFrom, r.effectiveTo],
  };
}
