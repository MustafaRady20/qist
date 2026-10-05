import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AppError } from "@/server/errors";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session";

/**
 * Data Access Layer: the single place that decides who the caller is.
 * Services call `requirePermission`; pages call `requirePageUser`.
 * Accepts the browser cookie or `Authorization: Bearer <token>` for API clients.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const bearer = (await headers()).get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  return session?.user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("unauthenticated", "يجب تسجيل الدخول أولًا");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AppError("forbidden", "غير مصرح بهذا الإجراء");
  }
  return user;
}

/** For Server Components: redirects to the login page instead of throwing. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
