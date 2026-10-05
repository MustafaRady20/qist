import "server-only";
import { and, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { diff, DOCUMENT_OPENED, recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { customers, type Customer } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { omit } from "@/lib/omit";
import { todayInCairo } from "@/server/time";
import {
  maskNationalId,
  moneySchema,
  nationalIdSchema,
  optionalText,
  PAGE_SIZE,
  phoneSchema,
} from "@/server/validation";

// ── Validation ──────────────────────────────────────────────────────────────

const optionalPhone = z
  .union([z.literal(""), phoneSchema])
  .transform((v) => v || null)
  .nullish();

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(3, { error: "أدخل الاسم الكامل" }).max(120),
  phone: phoneSchema,
  altPhone: optionalPhone,
  whatsapp: optionalPhone,
  nationalId: z
    .union([z.literal(""), nationalIdSchema])
    .transform((v) => v || null)
    .nullish(),
  address: optionalText(300),
  employer: optionalText(),
  jobTitle: optionalText(),
  monthlyIncome: moneySchema.nullish(),
  emergencyContactName: optionalText(),
  emergencyContactPhone: optionalPhone,
  guarantorName: optionalText(),
  guarantorPhone: optionalPhone,
  guarantorRelation: optionalText(60),
  guarantorAddress: optionalText(300),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

export const customerUpdateSchema = customerInputSchema.partial();

// ── Queries ─────────────────────────────────────────────────────────────────

export type CustomerTab = "all" | "active" | "noBalance" | "overdue" | "multi" | "new";
export type DerivedCustomerStatus = "active" | "overdue" | "noBalance" | "blocked";

export type CustomerListItem = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  activeContracts: number;
  financed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  nextDue: string | null;
  status: DerivedCustomerStatus;
  createdAt: Date;
};

const NEW_CUSTOMER_DAYS = 30;

/**
 * Per-customer balances from contracts/installments. Draft and cancelled
 * contracts never count; "outstanding" and "overdue" only consider active ones.
 */
function balancesQuery(today: string) {
  return sql`
    select
      cu.id, cu.code, cu.full_name, cu.phone, cu.national_id, cu.status as stored_status, cu.created_at,
      coalesce(k.active_contracts, 0)::int as active_contracts,
      coalesce(k.financed, 0)::bigint as financed,
      coalesce(i.paid, 0)::bigint as paid,
      coalesce(i.outstanding, 0)::bigint as outstanding,
      coalesce(i.overdue, 0)::bigint as overdue,
      i.next_due
    from customers cu
    left join (
      select customer_id,
        count(*) filter (where status = 'active') as active_contracts,
        sum(principal) filter (where status not in ('draft', 'cancelled')) as financed
      from contracts group by customer_id
    ) k on k.customer_id = cu.id
    left join (
      select c.customer_id,
        sum(i.paid_amount) as paid,
        sum(i.amount - i.paid_amount - i.waived_amount) filter (where c.status = 'active') as outstanding,
        sum(i.amount - i.paid_amount - i.waived_amount) filter (where c.status = 'active' and i.due_date < ${today}) as overdue,
        min(i.due_date) filter (where c.status = 'active' and i.paid_amount + i.waived_amount < i.amount and i.due_date >= ${today}) as next_due
      from installments i join contracts c on c.id = i.contract_id
      where c.status not in ('draft', 'cancelled')
      group by c.customer_id
    ) i on i.customer_id = cu.id`;
}

type BalanceRow = {
  id: string;
  code: string;
  full_name: string;
  phone: string;
  stored_status: "active" | "blocked";
  created_at: Date;
  active_contracts: number;
  financed: string;
  paid: string;
  outstanding: string;
  overdue: string;
  next_due: string | null;
};

const statusExpr = sql`case
  when b.stored_status = 'blocked' then 'blocked'
  when b.overdue > 0 then 'overdue'
  when b.outstanding > 0 then 'active'
  else 'noBalance' end`;

function tabFilter(tab: CustomerTab, today: string): SQL {
  switch (tab) {
    case "all":
      return sql`true`;
    case "active":
      return sql`b.stored_status = 'active' and b.outstanding > 0 and b.overdue = 0`;
    case "overdue":
      return sql`b.overdue > 0`;
    case "noBalance":
      return sql`b.outstanding = 0`;
    case "multi":
      return sql`b.active_contracts > 1`;
    case "new":
      return sql`b.created_at >= (${today}::date - ${NEW_CUSTOMER_DAYS}::int)`;
  }
}

function searchFilter(q: string | undefined): SQL {
  if (!q) return sql`true`;
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const digits = q.replace(/\D/g, "");
  return sql`(b.full_name ilike ${like} or b.code ilike ${like}${
    digits.length >= 3 ? sql` or b.phone like ${`%${digits}%`} or b.national_id like ${`%${digits}%`}` : sql``
  })`;
}

function toListItem(r: BalanceRow & { derived_status: DerivedCustomerStatus }): CustomerListItem {
  return {
    id: r.id,
    code: r.code,
    fullName: r.full_name,
    phone: r.phone,
    activeContracts: r.active_contracts,
    financed: Number(r.financed),
    paid: Number(r.paid),
    outstanding: Number(r.outstanding),
    overdue: Number(r.overdue),
    nextDue: r.next_due,
    status: r.derived_status,
    createdAt: new Date(r.created_at),
  };
}

export async function listCustomers(params: { tab?: CustomerTab; q?: string; page?: number }) {
  await requirePermission("customers:read");
  const today = todayInCairo();
  const tab = params.tab ?? "all";
  const page = Math.max(1, params.page ?? 1);
  const where = sql`${tabFilter(tab, today)} and ${searchFilter(params.q?.trim())}`;

  const rows = await db.execute<BalanceRow & { derived_status: DerivedCustomerStatus; total: string }>(sql`
    with b as (${balancesQuery(today)})
    select b.*, ${statusExpr} as derived_status, count(*) over () as total
    from b where ${where}
    order by b.created_at desc, b.code desc
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);

  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    items: rows.map(toListItem),
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getCustomerSummary() {
  await requirePermission("customers:read");
  const today = todayInCairo();
  const [row] = await db.execute<{ total: string; active: string; no_balance: string; overdue: string }>(sql`
    with b as (${balancesQuery(today)})
    select count(*) as total,
      count(*) filter (where b.active_contracts > 0) as active,
      count(*) filter (where b.outstanding = 0) as no_balance,
      count(*) filter (where b.overdue > 0) as overdue
    from b`);
  return {
    total: Number(row.total),
    active: Number(row.active),
    noBalance: Number(row.no_balance),
    overdue: Number(row.overdue),
  };
}

export type CustomerDetail = Omit<Customer, "nationalId" | "createdBy"> & {
  nationalId: string | null;
  balances: Pick<CustomerListItem, "activeContracts" | "financed" | "paid" | "outstanding" | "overdue" | "nextDue" | "status">;
};

/** Accepts the UUID or the human code (C-1042). */
export async function getCustomer(idOrCode: string): Promise<CustomerDetail> {
  const actor = await requirePermission("customers:read");
  const customer = await findCustomer(idOrCode);
  if (!customer) throw notFound("العميل");

  const today = todayInCairo();
  const [b] = await db.execute<BalanceRow & { derived_status: DerivedCustomerStatus }>(sql`
    with b as (${balancesQuery(today)})
    select b.*, ${statusExpr} as derived_status from b where b.id = ${customer.id}`);
  const item = toListItem(b);

  return {
    ...omit(customer, ["createdBy"]),
    // Full national ID only for staff who can edit customer records.
    nationalId: can(actor.role, "customers:write") ? customer.nationalId : maskNationalId(customer.nationalId),
    balances: {
      activeContracts: item.activeContracts,
      financed: item.financed,
      paid: item.paid,
      outstanding: item.outstanding,
      overdue: item.overdue,
      nextDue: item.nextDue,
      status: item.status,
    },
  };
}

export type CustomerActivityItem = {
  id: number;
  action: string;
  ref: string | null;
  actorName: string | null;
  createdAt: Date;
};

/**
 * Latest audit entries about the customer and their contracts (Figma
 * "customer-profile" → النشاط). Old/new values stay in the audit log itself,
 * and so do document views, which would otherwise crowd out real changes.
 */
export async function listCustomerActivity(idOrCode: string, limit = 10): Promise<CustomerActivityItem[]> {
  await requirePermission("customers:read");
  const customer = await findCustomer(idOrCode);
  if (!customer) throw notFound("العميل");

  const rows = await db.execute<{ id: string; action: string; ref: string | null; actor_name: string | null; created_at: Date }>(sql`
    select a.id, a.action, a.ref, u.name as actor_name, a.created_at
    from audit_log a left join users u on u.id = a.actor_id
    where ((a.entity_type = 'customer' and a.entity_id = ${customer.id})
       or (a.entity_type = 'contract' and a.entity_id in (select id::text from contracts where customer_id = ${customer.id})))
      and a.action <> ${DOCUMENT_OPENED}
    order by a.created_at desc, a.id desc
    limit ${Math.min(Math.max(1, limit), 50)}`);
  return rows.map((r) => ({
    id: Number(r.id),
    action: r.action,
    ref: r.ref,
    actorName: r.actor_name,
    createdAt: new Date(r.created_at),
  }));
}

async function findCustomer(idOrCode: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrCode);
  const [customer] = await db
    .select()
    .from(customers)
    .where(isUuid ? eq(customers.id, idOrCode) : eq(customers.code, idOrCode.toUpperCase()))
    .limit(1);
  return customer;
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * Figma "duplicate-customer" / "duplicate-phone": a phone or national ID that
 * already belongs to a customer is rejected with the existing record attached.
 */
async function assertNoDuplicate(input: { phone?: string; nationalId?: string | null }, exceptId?: string) {
  const conditions = [
    input.phone ? eq(customers.phone, input.phone) : undefined,
    input.nationalId ? eq(customers.nationalId, input.nationalId) : undefined,
  ].filter(Boolean) as SQL[];
  if (!conditions.length) return;

  const [existing] = await db
    .select({ id: customers.id, code: customers.code, fullName: customers.fullName, phone: customers.phone, nationalId: customers.nationalId })
    .from(customers)
    .where(and(or(...conditions), exceptId ? ne(customers.id, exceptId) : undefined))
    .limit(1);

  if (existing) {
    const field = input.phone && existing.phone === input.phone ? "phone" : "nationalId";
    throw new AppError(
      "conflict",
      field === "phone" ? "رقم الهاتف مرتبط بعميل موجود" : "الرقم القومي مرتبط بعميل موجود",
      { field, existing: { id: existing.id, code: existing.code, fullName: existing.fullName } },
    );
  }
}

export async function createCustomer(input: CustomerInput) {
  const actor = await requirePermission("customers:write");
  const data = customerInputSchema.parse(input);
  await assertNoDuplicate(data);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(customers)
      .values({ ...data, createdBy: actor.id })
      .returning();
    await recordAudit(
      { actorId: actor.id, action: "إضافة عميل", entityType: "customer", entityId: created.id, ref: created.code, after: auditView(created) },
      tx,
    );
    return created;
  });
}

export async function updateCustomer(idOrCode: string, input: z.input<typeof customerUpdateSchema>) {
  const actor = await requirePermission("customers:write");
  const data = customerUpdateSchema.parse(input);
  const current = await findCustomer(idOrCode);
  if (!current) throw notFound("العميل");
  await assertNoDuplicate({ phone: data.phone, nationalId: data.nationalId }, current.id);

  const change = auditDiff(current, data);
  if (!change.changed) return current;

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(customers).set(data).where(eq(customers.id, current.id)).returning();
    await recordAudit(
      { actorId: actor.id, action: "تعديل بيانات عميل", entityType: "customer", entityId: current.id, ref: current.code, before: change.before, after: change.after },
      tx,
    );
    return updated;
  });
}

export const blockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().min(3, { error: "اذكر سبب التغيير" }).max(300),
});

/** Blocking stops new contracts; the record and its history are kept. */
export async function setCustomerBlocked(idOrCode: string, input: z.input<typeof blockSchema>) {
  const actor = await requirePermission("customers:block");
  const { blocked, reason } = blockSchema.parse(input);
  const current = await findCustomer(idOrCode);
  if (!current) throw notFound("العميل");
  const status = blocked ? "blocked" : "active";
  if (current.status === status) return current;

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(customers).set({ status }).where(eq(customers.id, current.id)).returning();
    await recordAudit(
      {
        actorId: actor.id,
        action: blocked ? "حظر عميل" : "إلغاء حظر عميل",
        entityType: "customer",
        entityId: current.id,
        ref: current.code,
        before: { status: current.status },
        after: { status, reason },
      },
      tx,
    );
    return updated;
  });
}

/** Audit payloads never store the full national ID. */
function auditView(c: Partial<Customer>) {
  const view: Record<string, unknown> = omit(c, ["createdAt", "updatedAt", "createdBy"]);
  if ("nationalId" in c) view.nationalId = maskNationalId(c.nationalId ?? null);
  return view;
}

/** Diffs raw values (so any national ID edit is detected), then masks the payloads. */
function auditDiff(current: Customer, patch: Partial<Customer>) {
  const change = diff(current as Record<string, unknown>, patch);
  return { ...change, before: auditView(change.before), after: auditView(change.after) };
}
