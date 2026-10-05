/**
 * Seeds the database.
 *   npm run db:seed        → admin user (from .env.local) + finance rules
 *   npm run db:seed:demo   → the above + demo customers/contracts from the Figma screens
 *
 * Idempotent: existing admin / rules / demo customers are left untouched.
 * Pass --reset-admin-password to overwrite the admin's password from .env.local.
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/server/auth/password";
import * as schema from "../src/server/db/schema";
import { buildFlatSchedule } from "../src/server/finance/schedule";
import { todayInCairo } from "../src/server/time";

const { users, financeRules, customers, contracts, installments, auditLog } = schema;
const args = new Set(process.argv.slice(2));
const EGP = 100;

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

async function seedFinanceRules(adminId: string) {
  const rules = [
    { key: "standard", version: 1, name: "القياسية", annualRateBp: 3_000, minTermMonths: 6, maxTermMonths: 24, minDownPaymentBp: 1_000, effectiveFrom: "2025-01-01", effectiveTo: "2026-03-31", isActive: false },
    { key: "standard", version: 2, name: "القياسية", annualRateBp: 3_500, minTermMonths: 6, maxTermMonths: 24, minDownPaymentBp: 1_000, effectiveFrom: "2026-04-01", effectiveTo: "2026-08-31", isActive: false },
    { key: "standard", version: 3, name: "القياسية", annualRateBp: 4_000, minTermMonths: 6, maxTermMonths: 24, minDownPaymentBp: 1_000, effectiveFrom: "2026-09-01", effectiveTo: null, isActive: true },
    { key: "devices", version: 1, name: "عروض الأجهزة", annualRateBp: 3_000, minTermMonths: 6, maxTermMonths: 12, minDownPaymentBp: 2_000, effectiveFrom: "2026-09-01", effectiveTo: null, isActive: true },
  ];
  let created = 0;
  for (const r of rules) {
    const [exists] = await db
      .select({ id: financeRules.id })
      .from(financeRules)
      .where(and(eq(financeRules.key, r.key), eq(financeRules.version, r.version)));
    if (exists) continue;
    await db.insert(financeRules).values({
      ...r,
      method: "flat",
      settlementPolicy: "إعفاء العائد المستقبلي",
      allowedCategories: r.key === "devices" ? "هواتف / أجهزة" : null,
      changeReason: "بيانات أولية",
      createdBy: adminId,
    });
    created++;
  }
  console.log(created ? `✓ ${created} finance rule version(s) created` : "• finance rules already seeded");
}

type Pay = "current" | { lateInstallments: number } | { partialLast: number } | "completed";

type DemoContract = {
  code: string;
  product: string;
  supplier?: string;
  cost: number;
  down: number;
  months: number;
  ruleKey: "standard" | "devices";
  firstDue: string;
  pay: Pay;
};

type DemoCustomer = {
  code: string;
  fullName: string;
  phone: string;
  nationalId?: string;
  address?: string;
  employer?: string;
  jobTitle?: string;
  monthlyIncome?: number;
  guarantorName?: string;
  createdAt: string;
  contracts: DemoContract[];
};

// Mirrors the people and purchases in the Figma screens. Payment histories are
// generated so balances are consistent with today's date.
const demo: DemoCustomer[] = [
  {
    code: "C-1042", fullName: "أحمد محمد علي", phone: "01001234567", nationalId: "29801011234567",
    address: "القاهرة، مدينة نصر", employer: "شركة النور", jobTitle: "محاسب", monthlyIncome: 15_000 * EGP,
    guarantorName: "محمد علي", createdAt: "2025-01-12",
    contracts: [
      { code: "CT-1024", product: "هاتف Samsung Galaxy • 256 GB • أسود", supplier: "متجر المورد", cost: 60_000 * EGP, down: 10_000 * EGP, months: 12, ruleKey: "standard", firstDue: "2026-01-01", pay: "current" },
      { code: "CT-1025", product: "ثلاجة", cost: 30_000 * EGP, down: 6_000 * EGP, months: 12, ruleKey: "devices", firstDue: "2026-03-01", pay: "current" },
    ],
  },
  {
    code: "C-1041", fullName: "منى خالد إبراهيم", phone: "01123456789", nationalId: "29505151234568",
    address: "الجيزة، الدقي", createdAt: "2025-11-02",
    contracts: [
      { code: "CT-1018", product: "ثلاجة", cost: 28_000 * EGP, down: 3_000 * EGP, months: 12, ruleKey: "standard", firstDue: "2025-12-23", pay: { partialLast: 1_500 * EGP } },
    ],
  },
  {
    code: "C-1038", fullName: "كريم حسن محمود", phone: "01234567890", createdAt: "2025-10-14",
    contracts: [
      { code: "CT-1016", product: "شاشة", cost: 45_000 * EGP, down: 5_000 * EGP, months: 12, ruleKey: "standard", firstDue: "2025-11-04", pay: { lateInstallments: 1 } },
    ],
  },
  {
    code: "C-1035", fullName: "سارة أحمد يوسف", phone: "01098765432", createdAt: "2024-12-20",
    contracts: [
      { code: "CT-0892", product: "غسالة", cost: 35_000 * EGP, down: 5_000 * EGP, months: 12, ruleKey: "standard", firstDue: "2025-01-15", pay: "completed" },
    ],
  },
  {
    code: "C-1030", fullName: "هبة عادل", phone: "01555123456", createdAt: "2025-06-01",
    contracts: [
      { code: "CT-0990", product: "لابتوب", cost: 32_000 * EGP, down: 4_000 * EGP, months: 12, ruleKey: "standard", firstDue: "2025-10-01", pay: { lateInstallments: 3 } },
    ],
  },
];

async function seedDemo(adminId: string) {
  const today = todayInCairo();
  let created = 0;
  for (const c of demo) {
    const [exists] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, c.phone));
    if (exists) continue;

    await db.transaction(async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({
          code: c.code, fullName: c.fullName, phone: c.phone, whatsapp: c.phone, nationalId: c.nationalId,
          address: c.address, employer: c.employer, jobTitle: c.jobTitle, monthlyIncome: c.monthlyIncome,
          guarantorName: c.guarantorName, createdBy: adminId, createdAt: new Date(c.createdAt),
        })
        .returning();

      for (const k of c.contracts) {
        // Historical demo contracts use the current rule version's figures.
        const [rule] = await tx
          .select()
          .from(financeRules)
          .where(and(eq(financeRules.key, k.ruleKey), eq(financeRules.isActive, true)));
        const principal = k.cost - k.down;
        const schedule = buildFlatSchedule({ principal, annualRateBp: rule.annualRateBp, termMonths: k.months, firstDueDate: k.firstDue });

        const [contract] = await tx
          .insert(contracts)
          .values({
            code: k.code, customerId: customer.id, financeRuleId: rule.id,
            status: k.pay === "completed" ? "completed" : "active",
            productDescription: k.product, supplier: k.supplier, purchaseCost: k.cost, downPayment: k.down,
            principal, annualRateBp: rule.annualRateBp, termMonths: k.months, installmentCount: schedule.rows.length,
            fees: 0, profit: schedule.profit, totalInstallments: schedule.total, firstDueDate: k.firstDue,
            createdBy: adminId, confirmedBy: adminId, confirmedAt: new Date(k.firstDue), createdAt: new Date(c.createdAt),
          })
          .returning();

        const due = schedule.rows.filter((r) => r.dueDate < today);
        const late = typeof k.pay === "object" && "lateInstallments" in k.pay ? k.pay.lateInstallments : 0;
        await tx.insert(installments).values(
          schedule.rows.map((r) => {
            let paid = 0;
            if (k.pay === "completed") paid = r.amount;
            else if (r.dueDate < today) {
              const idx = due.indexOf(r);
              const isLastDue = idx === due.length - 1;
              if (typeof k.pay === "object" && "partialLast" in k.pay && isLastDue) paid = k.pay.partialLast;
              else paid = idx < due.length - late ? r.amount : 0;
            }
            return {
              contractId: contract.id, seq: r.seq, dueDate: r.dueDate, openingPrincipal: r.openingPrincipal,
              principal: r.principal, profit: r.profit, fees: r.fees, amount: r.amount,
              closingPrincipal: r.closingPrincipal, paidAmount: paid,
            };
          }),
        );
      }
    });
    created++;
  }

  // Keep generated codes after the demo ones.
  await db.execute(sql`select setval('customer_code_seq', greatest((select max(substring(code from 3)::int) from customers), 1000))`);
  await db.execute(sql`select setval('contract_code_seq', greatest((select max(substring(code from 4)::int) from contracts), 1000))`);
  console.log(created ? `✓ ${created} demo customer(s) with contracts created` : "• demo data already seeded");
}

async function main() {
  const admin = await seedAdmin();
  await seedFinanceRules(admin.id);
  if (args.has("--demo")) await seedDemo(admin.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
