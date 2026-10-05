import "server-only";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db } from "@/server/db";
import { PAGE_SIZE } from "@/server/validation";

export type AuditListItem = {
  id: number;
  actorName: string | null;
  action: string;
  entityType: string;
  ref: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
};

/** Read-only view of the audit trail (Figma "audit"), newest first. */
export async function listAuditLog(params: { q?: string; page?: number }) {
  await requirePermission("audit:read");
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : undefined;

  const rows = await db.execute<{
    id: string;
    actor_name: string | null;
    action: string;
    entity_type: string;
    ref: string | null;
    before: unknown;
    after: unknown;
    ip: string | null;
    user_agent: string | null;
    created_at: Date;
    total: string;
  }>(sql`
    select a.*, u.name as actor_name, count(*) over () as total
    from audit_log a left join users u on u.id = a.actor_id
    where ${like ? sql`(a.action ilike ${like} or a.ref ilike ${like} or u.name ilike ${like})` : sql`true`}
    order by a.created_at desc, a.id desc
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`);

  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    items: rows.map(
      (r): AuditListItem => ({
        id: Number(r.id),
        actorName: r.actor_name,
        action: r.action,
        entityType: r.entity_type,
        ref: r.ref,
        before: r.before,
        after: r.after,
        ip: r.ip,
        userAgent: r.user_agent,
        createdAt: new Date(r.created_at),
      }),
    ),
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
