import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { db, type Tx } from "@/server/db";
import { contractGroups, contracts, customers } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { optionalText } from "@/server/validation";

export const groupInputSchema = z.object({
  customerId: z.uuid({ error: "اختر العميل" }),
  contractIds: z.array(z.uuid()).min(2, { error: "اختر عقدين على الأقل" }).max(50),
  name: z.string().trim().min(2, { error: "أدخل اسم المجموعة" }).max(80),
  note: optionalText(300),
});

/**
 * Groups active contracts of one customer for follow-up (Figma "consolidation").
 * Installments, dates, balances and statuses are not touched.
 */
export async function createContractGroup(input: z.input<typeof groupInputSchema>) {
  const actor = await requirePermission("contracts:write");
  const data = groupInputSchema.parse(input);
  const ids = [...new Set(data.contractIds)];
  if (ids.length < 2) throw new AppError("validation", "اختر عقدين على الأقل", { fieldErrors: { contractIds: "اختر عقدين على الأقل" } });

  return db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, data.customerId));
    if (!customer) throw notFound("العميل");

    const rows = await tx.select().from(contracts).where(inArray(contracts.id, ids)).for("update");
    if (rows.length !== ids.length) throw notFound("العقد");
    for (const c of rows) {
      if (c.customerId !== customer.id) throw new AppError("invalid_state", `العقد ${c.code} لا يخص هذا العميل`);
      if (c.status !== "active") throw new AppError("invalid_state", `العقد ${c.code} غير نشط ولا يمكن ضمه لمجموعة`);
      if (c.groupId) throw new AppError("invalid_state", `العقد ${c.code} ضمن مجموعة أخرى بالفعل`);
    }

    const [group] = await tx
      .insert(contractGroups)
      .values({ customerId: customer.id, name: data.name, note: data.note ?? null, createdBy: actor.id })
      .returning();
    await tx.update(contracts).set({ groupId: group.id }).where(inArray(contracts.id, ids));

    await recordAudit(
      {
        actorId: actor.id,
        action: "تجميع عقود",
        entityType: "contract_group",
        entityId: group.id,
        ref: rows.map((c) => c.code).sort().join(" + "),
        after: { name: group.name, note: group.note, contracts: rows.map((c) => c.code).sort() },
      },
      tx,
    );
    return group;
  });
}

/** The group with its customer. Member contracts are read through the contracts service. */
export async function getContractGroup(id: string) {
  await requirePermission("contracts:read");
  if (!z.uuid().safeParse(id).success) throw notFound("المجموعة");
  const [row] = await db
    .select({ group: contractGroups, customer: { id: customers.id, code: customers.code, fullName: customers.fullName, phone: customers.phone, whatsapp: customers.whatsapp } })
    .from(contractGroups)
    .innerJoin(customers, eq(customers.id, contractGroups.customerId))
    .where(eq(contractGroups.id, id));
  if (!row) throw notFound("المجموعة");
  return { ...row.group, customer: row.customer };
}

async function dissolve(tx: Tx, groupId: string, actorId: string, reason: string) {
  const members = await tx.select({ code: contracts.code }).from(contracts).where(eq(contracts.groupId, groupId));
  await tx.update(contracts).set({ groupId: null }).where(eq(contracts.groupId, groupId));
  const [group] = await tx
    .update(contractGroups)
    .set({ dissolvedAt: new Date(), dissolvedBy: actorId })
    .where(and(eq(contractGroups.id, groupId), isNull(contractGroups.dissolvedAt)))
    .returning();
  if (!group) return;
  await recordAudit(
    {
      actorId,
      action: "فك مجموعة عقود",
      entityType: "contract_group",
      entityId: groupId,
      ref: group.name,
      before: { contracts: members.map((m) => m.code).sort() },
      after: { reason },
    },
    tx,
  );
}

/** Ungroups the contracts; they carry on unchanged. The group row is kept for history. */
export async function dissolveContractGroup(id: string) {
  const actor = await requirePermission("contracts:write");
  const group = await getContractGroup(id);
  if (group.dissolvedAt) throw new AppError("invalid_state", "المجموعة مفكوكة بالفعل");
  await db.transaction((tx) => dissolve(tx, group.id, actor.id, "بطلب المستخدم"));
}

/** Called after a member stops being active: a group of fewer than two contracts is dissolved. */
export async function leaveGroup(tx: Tx, groupId: string, actorId: string) {
  const [{ remaining }] = await tx
    .select({ remaining: sql<number>`count(*)::int` })
    .from(contracts)
    .where(eq(contracts.groupId, groupId));
  if (remaining < 2) await dissolve(tx, groupId, actorId, "لم يتبقَّ عقدان نشطان في المجموعة");
}
