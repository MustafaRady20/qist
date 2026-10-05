import "server-only";
import { db, type Tx } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { getRequestMeta } from "@/server/request";

/** Action name for viewing a stored document (read access is audited too). */
export const DOCUMENT_OPENED = "فتح مستند";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: "user" | "customer" | "contract" | "contract_group" | "finance_rule" | "session";
  entityId?: string;
  ref?: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Appends to the permanent audit trail (Foundations: every sensitive action is
 * recorded with who, when, old and new values). Pass the transaction so the
 * entry commits or rolls back with the change it describes.
 */
export async function recordAudit(entry: AuditEntry, tx: Tx | typeof db = db) {
  const meta = await getRequestMeta();
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    ref: entry.ref,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 500),
  });
}

/** Only the fields that changed, for compact before/after audit payloads. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (after[key] !== undefined && JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
