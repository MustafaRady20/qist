/**
 * Seeds the database with the admin user only (from .env.local):
 *   npm run db:seed
 *
 * No finance rules, customers or contracts are created; add installment plans
 * from Settings after logging in.
 *
 * Idempotent: an existing admin is left untouched.
 * Pass --reset-admin-password to overwrite the admin's password from .env.local.
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/server/auth/password";
import * as schema from "../src/server/db/schema";

const { users, auditLog } = schema;
const args = new Set(process.argv.slice(2));

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema, casing: "snake_case" });

async function seedAdmin() {
  const name = process.env.SEED_ADMIN_NAME || "مدير النظام";
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.local");
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);

  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  if (existing) {
    if (args.has("--reset-admin-password")) {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(password), failedLoginAttempts: 0, lockedUntil: null, isActive: true })
        .where(eq(users.id, existing.id));
      console.log(`✓ admin ${email}: password reset`);
    } else {
      console.log(`• admin ${email} already exists (use --reset-admin-password to reset it)`);
    }
    return existing;
  }
  const [admin] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), role: "owner" })
    .returning();
  await db.insert(auditLog).values({ actorId: null, action: "إنشاء حساب المدير", entityType: "user", entityId: admin.id, ref: email });
  console.log(`✓ admin ${email} created (role: owner)`);
  return admin;
}

async function main() {
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
