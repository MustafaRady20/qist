import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CustomInstallment } from "../finance/schedule";

/*
 * Conventions
 * - Money is bigint piastres (1 EGP = 100). Never floats.
 * - Rates are basis points (40% = 4000).
 * - Financial records are never deleted (Foundations: record retention);
 *   corrections are new rows / reversing entries, and every change is audited.
 */

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ── Auth ────────────────────────────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["owner", "manager", "collector", "viewer"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    failedLoginAttempts: smallint("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ── Audit ───────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Human reference shown in the UI (C-1042, CT-1024, v3 → v4). */
    ref: text("ref"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

// ── Customers ───────────────────────────────────────────────────────────────

export const customerCodeSeq = pgSequence("customer_code_seq", { startWith: 1001 });

export const customerStatus = pgEnum("customer_status", ["active", "blocked"]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** C-1043 */
    code: text("code")
      .notNull()
      .default(sql`'C-' || nextval('customer_code_seq')`),
    fullName: text("full_name").notNull(),
    /** Normalized to 11-digit Egyptian mobile format (01XXXXXXXXX). */
    phone: text("phone").notNull(),
    altPhone: text("alt_phone"),
    whatsapp: text("whatsapp"),
    nationalId: text("national_id"),
    address: text("address"),
    employer: text("employer"),
    jobTitle: text("job_title"),
    monthlyIncome: money("monthly_income"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    guarantorName: text("guarantor_name"),
    guarantorPhone: text("guarantor_phone"),
    guarantorRelation: text("guarantor_relation"),
    guarantorAddress: text("guarantor_address"),
    status: customerStatus("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_code_key").on(t.code),
    uniqueIndex("customers_phone_key").on(t.phone),
    uniqueIndex("customers_national_id_key").on(t.nationalId),
    index("customers_name_idx").on(t.fullName),
  ],
);

export const documentKind = pgEnum("document_kind", ["national_id", "income_proof", "contract", "guarantor_id", "other"]);

/** Uploaded files (ID scans, income proof, signed contracts). Kept with the customer record, never deleted. */
export const customerDocuments = pgTable(
  "customer_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: documentKind("kind").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Path of the file under STORAGE_DIR; never exposed to clients. */
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("customer_documents_customer_idx").on(t.customerId, t.createdAt)],
);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/**
 * File contents when STORAGE_DRIVER=database (hosts without a persistent disk).
 * Keyed like the on-disk store; rows are written once and never updated.
 */
export const storedFiles = pgTable("stored_files", {
  key: text("key").primaryKey(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

// ── Finance rules (versioned) ───────────────────────────────────────────────

export const financeMethod = pgEnum("finance_method", ["flat"]);

/** What the rate is charged on: the financed amount (price − down payment) or the full price. */
export const profitBase = pgEnum("profit_base", ["principal", "purchase_cost"]);

export const financeRules = pgTable(
  "finance_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable identity across versions ("standard"). */
    key: text("key").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    annualRateBp: integer("annual_rate_bp").notNull(),
    method: financeMethod("method").notNull().default("flat"),
    minTermMonths: smallint("min_term_months").notNull(),
    maxTermMonths: smallint("max_term_months").notNull(),
    minDownPaymentBp: integer("min_down_payment_bp").notNull().default(0),
    settlementPolicy: text("settlement_policy"),
    allowedCategories: text("allowed_categories"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    isActive: boolean("is_active").notNull().default(true),
    changeReason: text("change_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("finance_rules_key_version_key").on(t.key, t.version),
    check("finance_rules_term_check", sql`${t.minTermMonths} >= 1 AND ${t.maxTermMonths} >= ${t.minTermMonths}`),
    check("finance_rules_rate_check", sql`${t.annualRateBp} >= 0 AND ${t.minDownPaymentBp} BETWEEN 0 AND 10000`),
  ],
);

// ── Contracts & installments ────────────────────────────────────────────────

/**
 * Follow-up group of one customer's active contracts (Figma "consolidation").
 * Grouping is for display and follow-up only: every contract keeps its own
 * schedule, balance and status.
 */
export const contractGroups = pgTable(
  "contract_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    name: text("name").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    /** Set when the group is dissolved; the row is kept for history. */
    dissolvedAt: timestamp("dissolved_at", { withTimezone: true }),
    dissolvedBy: uuid("dissolved_by").references(() => users.id),
  },
  (t) => [index("contract_groups_customer_idx").on(t.customerId)],
);

export const contractCodeSeq = pgSequence("contract_code_seq", { startWith: 1001 });

/** Stored lifecycle state. "Overdue" is derived from installments, not stored. */
export const contractStatus = pgEnum("contract_status", [
  "draft",
  "active",
  "completed",
  "settled",
  "consolidated",
  "cancelled",
]);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** CT-1024 */
    code: text("code")
      .notNull()
      .default(sql`'CT-' || nextval('contract_code_seq')`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    financeRuleId: uuid("finance_rule_id")
      .notNull()
      .references(() => financeRules.id),
    status: contractStatus("status").notNull().default("draft"),
    /** Current follow-up group, if any. */
    groupId: uuid("group_id").references(() => contractGroups.id),

    productDescription: text("product_description").notNull(),
    quantity: smallint("quantity").notNull().default(1),
    supplier: text("supplier"),
    purchaseCost: money("purchase_cost").notNull(),
    downPayment: money("down_payment").notNull().default(0),

    // Snapshot of the plan at creation; the rule version may change later.
    principal: money("principal").notNull(),
    annualRateBp: integer("annual_rate_bp").notNull(),
    /** Chosen per contract in the wizard, not by the plan. */
    profitBase: profitBase("profit_base").notNull().default("principal"),
    termMonths: smallint("term_months").notNull(),
    installmentCount: smallint("installment_count").notNull(),
    fees: money("fees").notNull().default(0),
    profit: money("profit").notNull(),
    totalInstallments: money("total_installments").notNull(),
    firstDueDate: date("first_due_date").notNull(),
    /** Installments whose amount was set by hand; the rest of the schedule is calculated. */
    customInstallments: jsonb("custom_installments").$type<CustomInstallment[]>().notNull().default([]),

    createdBy: uuid("created_by").references(() => users.id),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("contracts_code_key").on(t.code),
    index("contracts_customer_idx").on(t.customerId),
    index("contracts_status_idx").on(t.status),
    index("contracts_group_idx").on(t.groupId),
    check("contracts_amounts_check", sql`${t.purchaseCost} > 0 AND ${t.downPayment} >= 0 AND ${t.downPayment} < ${t.purchaseCost}`),
    check("contracts_principal_check", sql`${t.principal} = ${t.purchaseCost} - ${t.downPayment}`),
    check("contracts_total_check", sql`${t.totalInstallments} = ${t.principal} + ${t.profit} + ${t.fees}`),
  ],
);

export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    seq: smallint("seq").notNull(),
    dueDate: date("due_date").notNull(),
    openingPrincipal: money("opening_principal").notNull(),
    principal: money("principal").notNull(),
    profit: money("profit").notNull(),
    fees: money("fees").notNull().default(0),
    amount: money("amount").notNull(),
    closingPrincipal: money("closing_principal").notNull(),
    /** Maintained by the payments module when payments are allocated. */
    paidAmount: money("paid_amount").notNull().default(0),
    /** Future profit forgiven by an early settlement: cancelled, never recorded as paid. */
    waivedAmount: money("waived_amount").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("installments_contract_seq_key").on(t.contractId, t.seq),
    index("installments_due_idx").on(t.dueDate),
    check("installments_amount_check", sql`${t.amount} = ${t.principal} + ${t.profit} + ${t.fees}`),
    check(
      "installments_paid_check",
      sql`${t.paidAmount} >= 0 AND ${t.waivedAmount} >= 0 AND ${t.paidAmount} + ${t.waivedAmount} <= ${t.amount}`,
    ),
  ],
);

// ── Early settlement ────────────────────────────────────────────────────────

export const paymentMethod = pgEnum("payment_method", ["cash", "bank_transfer", "wallet"]);

/** One row per settled contract: the breakdown that was quoted and the money received for it. */
export const contractSettlements = pgTable(
  "contract_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    remainingPrincipal: money("remaining_principal").notNull(),
    /** Unpaid profit of installments already due on the settlement date. */
    accruedProfit: money("accrued_profit").notNull(),
    /** Unpaid profit of future installments, forgiven by the policy. */
    waivedProfit: money("waived_profit").notNull(),
    outstandingFees: money("outstanding_fees").notNull(),
    amount: money("amount").notNull(),
    /** The rule's settlement policy text at the time ("إعفاء العائد المستقبلي • الإصدار 3"). */
    policy: text("policy").notNull(),
    reason: text("reason").notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    paymentReference: text("payment_reference"),
    settledOn: date("settled_on").notNull(),
    settledBy: uuid("settled_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("contract_settlements_contract_key").on(t.contractId),
    check(
      "contract_settlements_amount_check",
      sql`${t.amount} = ${t.remainingPrincipal} + ${t.accruedProfit} + ${t.outstandingFees}`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type Customer = typeof customers.$inferSelect;
export type CustomerDocument = typeof customerDocuments.$inferSelect;
export type DocumentKind = (typeof documentKind.enumValues)[number];
export type FinanceRule = typeof financeRules.$inferSelect;
export type ProfitBase = (typeof profitBase.enumValues)[number];
export type Contract = typeof contracts.$inferSelect;
export type ContractStatus = (typeof contractStatus.enumValues)[number];
export type Installment = typeof installments.$inferSelect;
export type ContractGroup = typeof contractGroups.$inferSelect;
export type ContractSettlement = typeof contractSettlements.$inferSelect;
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
