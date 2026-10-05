import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { sessions, users, type User } from "@/server/db/schema";

export const SESSION_COOKIE = "qist_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend the session when less than this remains, so active users stay signed in. */
const RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = Pick<User, "id" | "name" | "email" | "role">;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 500),
  });
  return { token, expiresAt };
}

/** Returns the session's user, or null if the token is unknown, expired, or the user is disabled. */
export async function validateSessionToken(token: string): Promise<{ user: SessionUser; expiresAt: Date } | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: { id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || !row.user.isActive) return null;

  let expiresAt = row.expiresAt;
  if (expiresAt.getTime() - Date.now() < RENEW_BELOW_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash));
  }
  const { id, name, email, role } = row.user;
  return { user: { id, name, email, role }, expiresAt };
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
