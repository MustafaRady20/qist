import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { getRequestMeta } from "@/server/request";
import { requireUser } from "./dal";
import { dummyPasswordHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { createSession, purgeExpiredSessions, revokeAllSessions, revokeSession } from "./session";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const loginSchema = z.object({
  email: z.email({ error: "أدخل بريدًا إلكترونيًا صحيحًا" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "أدخل كلمة المرور" }),
});

const invalidCredentials = () => new AppError("unauthenticated", "البريد الإلكتروني أو كلمة المرور غير صحيحة");

/**
 * Verifies credentials and opens a session. After 5 consecutive failures the
 * account is locked for 15 minutes. Unknown emails take the same time as known
 * ones and return the same error, so accounts can't be enumerated.
 */
export async function login(input: z.input<typeof loginSchema>) {
  const { email, password } = loginSchema.parse(input);
  const meta = await getRequestMeta();

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!user) {
    await verifyPassword(await dummyPasswordHash(), password);
    throw invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("locked", `الحساب مقفل مؤقتًا بعد محاولات دخول متكررة. حاول بعد ${LOCK_MINUTES} دقيقة.`);
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || !user.isActive) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      })
      .where(eq(users.id, user.id));
    if (lock) {
      await recordAudit({ actorId: null, action: "قفل الحساب", entityType: "user", entityId: user.id, ref: user.email });
    }
    throw invalidCredentials();
  }

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  const session = await createSession(user.id, meta);
  await purgeExpiredSessions();
  await recordAudit({ actorId: user.id, action: "تسجيل دخول", entityType: "session", entityId: user.id, ref: user.email });

  return {
    ...session,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export async function logout(token: string | undefined) {
  if (token) await revokeSession(token);
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "أدخل كلمة المرور الحالية" }),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, { error: `كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل` }),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    error: "اختر كلمة مرور مختلفة عن الحالية",
    path: ["newPassword"],
  });

/** Changes the caller's password and signs out every other session. */
export async function changePassword(input: z.input<typeof changePasswordSchema>) {
  const actor = await requireUser();
  const { currentPassword, newPassword } = changePasswordSchema.parse(input);
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("validation", "كلمة المرور الحالية غير صحيحة");
  }
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  await revokeAllSessions(user.id);
  await recordAudit({ actorId: user.id, action: "تغيير كلمة المرور", entityType: "user", entityId: user.id, ref: user.email });
  const meta = await getRequestMeta();
  return createSession(user.id, meta);
}
