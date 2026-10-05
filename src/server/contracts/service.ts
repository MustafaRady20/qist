import "server-only";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { db, type Tx } from "@/server/db";
import {
  contractGroups,
  contracts,
  contractSettlements,
  customers,
  financeRules,
  installments,
  type Contract,
  type FinanceRule,
} from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { buildFlatSchedule, type Schedule } from "@/server/finance/schedule";
import { getUsableRule } from "@/server/finance-rules/service";
import { todayInCairo } from "@/server/time";
import { isoDateSchema, moneySchema, optionalText, PAGE_SIZE } from "@/server/validation";

// ── Validation ──────────────────────────────────────────────────────────────

/** Wizard steps 1–4 (customer, purchase, down payment, plan). Money in piastres. */
export const contractInputSchema = z.object({
  customerId: z.uuid({ error: "اختر العميل" }),
  productDescription: z.string().trim().min(2, { error: "أدخل المنتج ومواصفاته" }).max(300),
  quantity: z.number().int().min(1).max(999).default(1),
  supplier: optionalText(120),
  purchaseCost: moneySchema.min(1, { error: "أدخل تكلفة الشراء" }),
  downPayment: moneySchema.default(0),
  financeRuleId: z.uuid({ error: "اختر خطة التقسيط" }),
  termMonths: z.number().int().min(1).max(120),
  fees: moneySchema.default(0),
  firstDueDate: isoDateSchema,
});
export type ContractInput = z.input<typeof contractInputSchema>;

type ParsedInput = z.output<typeof contractInputSchema>;

// ── Plan calculation ────────────────────────────────────────────────────────

export type ContractPlan = {
  purchaseCost: number;
  downPayment: number;
  principal: number;
  annualRateBp: number;
  termMonths: number;
  installmentCount: number;
  fees: number;
  schedule: Schedule;
  /** Installment price = down payment + all installments (Figma: سعر البيع بالتقسيط). */
  salePrice: number;
  rule: Pick<FinanceRule, "id" | "key" | "version" | "name">;
};

/** Validates the plan against its rule version and computes the schedule. */
function computePlan(data: ParsedInput, rule: FinanceRule, today: string): ContractPlan {
  const errors: Record<string, string> = {};
  if (data.downPayment >= data.purchaseCost) errors.downPayment = "المقدم يجب أن يكون أقل من تكلفة الشراء";
  const minDown = Math.ceil((data.purchaseCost * rule.minDownPaymentBp) / 10_000);
  if (data.downPayment < minDown) {
    errors.downPayment = `الحد الأدنى للمقدم ${rule.minDownPaymentBp / 100}% (${(minDown / 100).toFixed(2)} جنيه)`;
  }
  if (data.termMonths < rule.minTermMonths || data.termMonths > rule.maxTermMonths) {
    errors.termMonths = `المدة المسموحة ${rule.minTermMonths}–${rule.maxTermMonths} شهرًا`;
  }
  if (data.firstDueDate <= today) errors.firstDueDate = "أول استحقاق يجب أن يكون بعد اليوم";
  if (Object.keys(errors).length) throw new AppError("validation", "راجع بيانات العقد", { fieldErrors: errors });

  const principal = data.purchaseCost - data.downPayment;
  const schedule = buildFlatSchedule({
    principal,
    annualRateBp: rule.annualRateBp,
    termMonths: data.termMonths,
    fees: data.fees,
    firstDueDate: data.firstDueDate,
  });
  return {
    purchaseCost: data.purchaseCost,
    downPayment: data.downPayment,
    principal,
    annualRateBp: rule.annualRateBp,
    termMonths: data.termMonths,
    installmentCount: schedule.rows.length,
    fees: data.fees,
    schedule,
    salePrice: data.downPayment + schedule.total,
    rule: { id: rule.id, key: rule.key, version: rule.version, name: rule.name },
  };
}

/** Wizard steps 4–6: calculation preview, nothing is saved. */
export async function previewContract(input: ContractInput): Promise<ContractPlan> {
  await requirePermission("contracts:read");
  const data = contractInputSchema.parse(input);
  const today = todayInCairo();
  return computePlan(data, await getUsableRule(data.financeRuleId, today), today);
}

// ── Queries ─────────────────────────────────────────────────────────────────

export type ContractTab = "active" | "draft" | "completed" | "overdue" | "settled" | "consolidated";
export type DerivedContractStatus = Contract["status"] | "overdue";

export type ContractListItem = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  productDescription: string;
  principal: number;
  profit: number;
  totalInstallments: number;
  paid: number;
  outstanding: number;
  overdue: number;
  status: DerivedContractStatus;
  /** Follow-up group the contract belongs to, if any. */
  groupId: string | null;
  createdAt: Date;
};

function contractBalances(today: string) {
  return sql`
    select c.*, cu.full_name as customer_name, cu.code as customer_code,
      coalesce(i.paid, 0)::bigint as paid,
      coalesce(i.outstanding, 0)::bigint as outstanding,
      coalesce(i.overdue, 0)::bigint as overdue
    from contracts c
    join customers cu on cu.id = c.customer_id
    left join (
      select contract_id,
        sum(paid_amount) as paid,
        sum(amount - paid_amount - waived_amount) as outstanding,
        sum(amount - paid_amount - waived_amount) filter (where due_date < ${today}) as overdue
      from installments group by contract_id
    ) i on i.contract_id = c.id`;
}

const derivedStatus = sql`case when b.status = 'active' and b.overdue > 0 then 'overdue' else b.status::text end`;

function contractTabFilter(tab: ContractTab): SQL {
  switch (tab) {
    // Figma's default tab lists every contract except drafts.
    case "active":
      return sql`b.status not in ('draft', 'cancelled')`;
    case "overdue":
      return sql`b.status = 'active' and b.overdue > 0`;
    // Grouping is a follow-up label, not a lifecycle state: grouped contracts stay active.
    case "consolidated":
      return sql`b.group_id is not null`;
    default:
      return sql`b.status = ${tab}`;
  }
}

type ContractRow = {
  id: string;
  code: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  product_description: string;
  principal: string;
  profit: string;
  total_installments: string;
  paid: string;
  outstanding: string;
  overdue: string;
  derived_status: DerivedContractStatus;
  group_id: string | null;
  created_at: Date;
};

function toContractItem(r: ContractRow): ContractListItem {
  return {
    id: r.id,
    code: r.code,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerCode: r.customer_code,
    productDescription: r.product_description,
    principal: Number(r.principal),
    profit: Number(r.profit),
    totalInstallments: Number(r.total_installments),
    paid: Number(r.paid),
    outstanding: Number(r.outstanding),
    overdue: Number(r.overdue),
    status: r.derived_status,
    groupId: r.group_id,
    createdAt: new Date(r.created_at),
  };
}

export async function listContracts(params: { tab?: ContractTab; q?: string; customerId?: string; page?: number }) {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : undefined;
  const where = sql.join(
    [
      contractTabFilter(params.tab ?? "active"),
      like ? sql`(b.code ilike ${like} or b.customer_name ilike ${like} or b.customer_code ilike ${like} or b.product_description ilike ${like})` : undefined,
      params.customerId ? sql`b.customer_id = ${params.customerId}` : undefined,
    ].filter(Boolean) as SQL[],
    sql` and `,
  );

  const rows = await db.execute<ContractRow & { total: string }>(sql`
    with b as (${contractBalances(today)})
    select b.*, ${derivedStatus} as derived_status, count(*) over () as total
    from b where ${where}
    order by b.created_at desc, b.code desc
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);

  const total = rows.length ? Number(rows[0].total) : 0;
  return { items: rows.map(toContractItem), page, pageSize: PAGE_SIZE, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type CustomerContractItem = ContractListItem & {
  /** Regular installment; null for drafts, which have no schedule yet. */
  installment: number | null;
};

/** Every contract of one customer except cancelled drafts, newest first (Figma "customer-profile"). */
export async function listCustomerContracts(customerId: string): Promise<CustomerContractItem[]> {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const rows = await db.execute<ContractRow & { installment: string | null }>(sql`
    with b as (${contractBalances(today)})
    select b.*, ${derivedStatus} as derived_status,
      (select i.amount from installments i where i.contract_id = b.id and i.seq = 1) as installment
    from b where b.customer_id = ${customerId} and b.status <> 'cancelled'
    order by b.created_at desc, b.code desc`);
  return rows.map((r) => ({ ...toContractItem(r), installment: r.installment === null ? null : Number(r.installment) }));
}

export type UpcomingInstallment = {
  contractId: string;
  contractCode: string;
  seq: number;
  dueDate: string;
  remaining: number;
  status: InstallmentStatus;
};

/** The next unpaid installment of each active contract of a customer, earliest first. */
export async function listNextInstallments(customerId: string): Promise<UpcomingInstallment[]> {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const rows = await db.execute<{ contract_id: string; code: string; seq: number; due_date: string; amount: string; paid_amount: string }>(sql`
    select distinct on (c.id) c.id as contract_id, c.code, i.seq, i.due_date, i.amount, i.paid_amount
    from installments i join contracts c on c.id = i.contract_id
    where c.customer_id = ${customerId} and c.status = 'active' and i.paid_amount + i.waived_amount < i.amount
    order by c.id, i.seq`);
  return rows
    .map((r) => {
      const amount = Number(r.amount);
      const paidAmount = Number(r.paid_amount);
      // Active contracts have nothing waived, so what is left is amount − paid.
      return {
        contractId: r.contract_id,
        contractCode: r.code,
        seq: r.seq,
        dueDate: r.due_date,
        remaining: amount - paidAmount,
        status: installmentStatus({ amount, paidAmount, dueDate: r.due_date }, today),
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.contractCode.localeCompare(b.contractCode));
}

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

/** Contract with its full schedule (Figma "contract-detail"). Accepts UUID or code (CT-1024). */
export async function getContract(idOrCode: string) {
  await requirePermission("contracts:read");
  const today = todayInCairo();
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrCode);
  const [row] = await db.execute<ContractRow>(sql`
    with b as (${contractBalances(today)})
    select b.*, ${derivedStatus} as derived_status from b
    where ${isUuid ? sql`b.id = ${idOrCode}` : sql`b.code = ${idOrCode.toUpperCase()}`}`);
  if (!row) throw notFound("العقد");

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, row.id));
  const [rule] = await db
    .select({ key: financeRules.key, name: financeRules.name, version: financeRules.version, settlementPolicy: financeRules.settlementPolicy })
    .from(financeRules)
    .where(eq(financeRules.id, contract.financeRuleId));
  const [group] = contract.groupId
    ? await db.select({ id: contractGroups.id, name: contractGroups.name }).from(contractGroups).where(eq(contractGroups.id, contract.groupId))
    : [];
  const [settlement] = await db.select().from(contractSettlements).where(eq(contractSettlements.contractId, row.id));
  const schedule = await db.select().from(installments).where(eq(installments.contractId, row.id)).orderBy(asc(installments.seq));

  return {
    ...contract,
    status: row.derived_status,
    customer: { id: row.customer_id, code: row.customer_code, fullName: row.customer_name },
    rule,
    group: group ?? null,
    settlement: settlement ?? null,
    balances: { paid: Number(row.paid), outstanding: Number(row.outstanding), overdue: Number(row.overdue) },
    installments: schedule.map((i) => ({
      ...i,
      remaining: i.amount - i.paidAmount - i.waivedAmount,
      status: installmentStatus(i, today),
    })),
  };
}

export type ContractDetail = Awaited<ReturnType<typeof getContract>>;

export type ContractActivityItem = { id: number; action: string; actorName: string | null; createdAt: Date };

/** Audit entries about one contract, newest first (Figma "contract-detail" → سجل النشاط). */
export async function listContractActivity(contractId: string, limit = 20): Promise<ContractActivityItem[]> {
  await requirePermission("contracts:read");
  const rows = await db.execute<{ id: string; action: string; actor_name: string | null; created_at: Date }>(sql`
    select a.id, a.action, u.name as actor_name, a.created_at
    from audit_log a left join users u on u.id = a.actor_id
    where a.entity_type = 'contract' and a.entity_id = ${contractId}
    order by a.created_at desc, a.id desc
    limit ${Math.min(Math.max(1, limit), 50)}`);
  return rows.map((r) => ({ id: Number(r.id), action: r.action, actorName: r.actor_name, createdAt: new Date(r.created_at) }));
}

// ── Mutations ───────────────────────────────────────────────────────────────

async function loadEligibleCustomer(tx: Tx, customerId: string) {
  // Lock the customer row so concurrent contract creation sees a consistent state.
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).for("update");
  if (!customer) throw notFound("العميل");
  if (customer.status === "blocked") throw new AppError("invalid_state", "العميل محظور ولا يمكن إنشاء عقود جديدة له");
  return customer;
}

function planColumns(plan: ContractPlan, data: ParsedInput) {
  return {
    customerId: data.customerId,
    financeRuleId: plan.rule.id,
    productDescription: data.productDescription,
    quantity: data.quantity,
    supplier: data.supplier ?? null,
    purchaseCost: plan.purchaseCost,
    downPayment: plan.downPayment,
    principal: plan.principal,
    annualRateBp: plan.annualRateBp,
    termMonths: plan.termMonths,
    installmentCount: plan.installmentCount,
    fees: plan.fees,
    profit: plan.schedule.profit,
    totalInstallments: plan.schedule.total,
    firstDueDate: data.firstDueDate,
  };
}

async function insertSchedule(tx: Tx, contractId: string, plan: ContractPlan) {
  await tx.insert(installments).values(
    plan.schedule.rows.map((r) => ({
      contractId,
      seq: r.seq,
      dueDate: r.dueDate,
      openingPrincipal: r.openingPrincipal,
      principal: r.principal,
      profit: r.profit,
      fees: r.fees,
      amount: r.amount,
      closingPrincipal: r.closingPrincipal,
    })),
  );
}

function contractAudit(c: Contract) {
  return {
    status: c.status,
    customerId: c.customerId,
    product: c.productDescription,
    purchaseCost: c.purchaseCost,
    downPayment: c.downPayment,
    principal: c.principal,
    profit: c.profit,
    fees: c.fees,
    total: c.totalInstallments,
    termMonths: c.termMonths,
    firstDueDate: c.firstDueDate,
    financeRuleId: c.financeRuleId,
  };
}

/**
 * Wizard step 6. `confirm: false` saves a draft ("حفظ مسودة"); `confirm: true`
 * creates the active contract with its installment schedule ("إنشاء العقد").
 */
export async function createContract(input: ContractInput, { confirm }: { confirm: boolean }) {
  const actor = await requirePermission(confirm ? "contracts:confirm" : "contracts:write");
  const data = contractInputSchema.parse(input);
  const today = todayInCairo();

  return db.transaction(async (tx) => {
    await loadEligibleCustomer(tx, data.customerId);
    const plan = computePlan(data, await getUsableRule(data.financeRuleId, today, tx), today);

    const [created] = await tx
      .insert(contracts)
      .values({
        ...planColumns(plan, data),
        status: confirm ? "active" : "draft",
        createdBy: actor.id,
        confirmedBy: confirm ? actor.id : null,
        confirmedAt: confirm ? new Date() : null,
      })
      .returning();
    if (confirm) await insertSchedule(tx, created.id, plan);

    await recordAudit(
      { actorId: actor.id, action: confirm ? "إنشاء عقد" : "حفظ مسودة عقد", entityType: "contract", entityId: created.id, ref: created.code, after: contractAudit(created) },
      tx,
    );
    return { contract: created, plan };
  });
}

async function loadDraft(tx: Tx, idOrCode: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrCode);
  const [c] = await tx
    .select()
    .from(contracts)
    .where(isUuid ? eq(contracts.id, idOrCode) : eq(contracts.code, idOrCode.toUpperCase()))
    .for("update");
  if (!c) throw notFound("العقد");
  if (c.status !== "draft") throw new AppError("invalid_state", "لا يمكن تعديل عقد بعد تأكيده. التصحيح يتم بقيود عكسية.");
  return c;
}

/** Replaces a draft's plan (all wizard fields are resubmitted). */
export async function updateDraft(idOrCode: string, input: ContractInput) {
  const actor = await requirePermission("contracts:write");
  const data = contractInputSchema.parse(input);
  const today = todayInCairo();

  return db.transaction(async (tx) => {
    const draft = await loadDraft(tx, idOrCode);
    await loadEligibleCustomer(tx, data.customerId);
    const plan = computePlan(data, await getUsableRule(data.financeRuleId, today, tx), today);
    const [updated] = await tx.update(contracts).set(planColumns(plan, data)).where(eq(contracts.id, draft.id)).returning();
    await recordAudit(
      { actorId: actor.id, action: "تعديل مسودة عقد", entityType: "contract", entityId: draft.id, ref: draft.code, before: contractAudit(draft), after: contractAudit(updated) },
      tx,
    );
    return { contract: updated, plan };
  });
}

/**
 * Confirms a draft. The plan is recomputed against today's rule validity, so a
 * draft saved under a now-retired rule version must be updated first.
 */
export async function confirmDraft(idOrCode: string) {
  const actor = await requirePermission("contracts:confirm");
  const today = todayInCairo();

  return db.transaction(async (tx) => {
    const draft = await loadDraft(tx, idOrCode);
    await loadEligibleCustomer(tx, draft.customerId);
    const data = contractInputSchema.parse({
      customerId: draft.customerId,
      productDescription: draft.productDescription,
      quantity: draft.quantity,
      supplier: draft.supplier,
      purchaseCost: draft.purchaseCost,
      downPayment: draft.downPayment,
      financeRuleId: draft.financeRuleId,
      termMonths: draft.termMonths,
      fees: draft.fees,
      firstDueDate: draft.firstDueDate,
    });
    const plan = computePlan(data, await getUsableRule(draft.financeRuleId, today, tx), today);

    const [confirmed] = await tx
      .update(contracts)
      .set({ ...planColumns(plan, data), status: "active", confirmedBy: actor.id, confirmedAt: new Date() })
      .where(eq(contracts.id, draft.id))
      .returning();
    await insertSchedule(tx, draft.id, plan);
    await recordAudit(
      { actorId: actor.id, action: "تأكيد عقد", entityType: "contract", entityId: draft.id, ref: draft.code, before: { status: "draft" }, after: contractAudit(confirmed) },
      tx,
    );
    return { contract: confirmed, plan };
  });
}

/** Drafts are cancelled, never deleted. */
export async function cancelDraft(idOrCode: string, reason: string) {
  const actor = await requirePermission("contracts:write");
  const why = z.string().trim().min(3, { error: "اذكر سبب الإلغاء" }).max(300).parse(reason);
  return db.transaction(async (tx) => {
    const draft = await loadDraft(tx, idOrCode);
    const [cancelled] = await tx.update(contracts).set({ status: "cancelled" }).where(eq(contracts.id, draft.id)).returning();
    await recordAudit(
      { actorId: actor.id, action: "إلغاء مسودة عقد", entityType: "contract", entityId: draft.id, ref: draft.code, before: { status: "draft" }, after: { status: "cancelled", reason: why } },
      tx,
    );
    return cancelled;
  });
}
