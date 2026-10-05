CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'completed', 'settled', 'consolidated', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."finance_method" AS ENUM('flat');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'manager', 'collector', 'viewer');--> statement-breakpoint
CREATE SEQUENCE "public"."contract_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."customer_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"ref" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'CT-' || nextval('contract_code_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"finance_rule_id" uuid NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"product_description" text NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"supplier" text,
	"purchase_cost" bigint NOT NULL,
	"down_payment" bigint DEFAULT 0 NOT NULL,
	"principal" bigint NOT NULL,
	"annual_rate_bp" integer NOT NULL,
	"term_months" smallint NOT NULL,
	"installment_count" smallint NOT NULL,
	"fees" bigint DEFAULT 0 NOT NULL,
	"profit" bigint NOT NULL,
	"total_installments" bigint NOT NULL,
	"first_due_date" date NOT NULL,
	"created_by" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_amounts_check" CHECK ("contracts"."purchase_cost" > 0 AND "contracts"."down_payment" >= 0 AND "contracts"."down_payment" < "contracts"."purchase_cost"),
	CONSTRAINT "contracts_principal_check" CHECK ("contracts"."principal" = "contracts"."purchase_cost" - "contracts"."down_payment"),
	CONSTRAINT "contracts_total_check" CHECK ("contracts"."total_installments" = "contracts"."principal" + "contracts"."profit" + "contracts"."fees")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'C-' || nextval('customer_code_seq') NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"alt_phone" text,
	"whatsapp" text,
	"national_id" text,
	"address" text,
	"employer" text,
	"job_title" text,
	"monthly_income" bigint,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"guarantor_name" text,
	"guarantor_phone" text,
	"guarantor_relation" text,
	"guarantor_address" text,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"annual_rate_bp" integer NOT NULL,
	"method" "finance_method" DEFAULT 'flat' NOT NULL,
	"min_term_months" smallint NOT NULL,
	"max_term_months" smallint NOT NULL,
	"min_down_payment_bp" integer DEFAULT 0 NOT NULL,
	"settlement_policy" text,
	"allowed_categories" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"change_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_rules_term_check" CHECK ("finance_rules"."min_term_months" >= 1 AND "finance_rules"."max_term_months" >= "finance_rules"."min_term_months"),
	CONSTRAINT "finance_rules_rate_check" CHECK ("finance_rules"."annual_rate_bp" >= 0 AND "finance_rules"."min_down_payment_bp" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"due_date" date NOT NULL,
	"opening_principal" bigint NOT NULL,
	"principal" bigint NOT NULL,
	"profit" bigint NOT NULL,
	"fees" bigint DEFAULT 0 NOT NULL,
	"amount" bigint NOT NULL,
	"closing_principal" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_amount_check" CHECK ("installments"."amount" = "installments"."principal" + "installments"."profit" + "installments"."fees"),
	CONSTRAINT "installments_paid_check" CHECK ("installments"."paid_amount" >= 0 AND "installments"."paid_amount" <= "installments"."amount")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_finance_rule_id_finance_rules_id_fk" FOREIGN KEY ("finance_rule_id") REFERENCES "public"."finance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_code_key" ON "contracts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "contracts_customer_idx" ON "contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "contracts_status_idx" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_key" ON "customers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_key" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_national_id_key" ON "customers" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_rules_key_version_key" ON "finance_rules" USING btree ("key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_contract_seq_key" ON "installments" USING btree ("contract_id","seq");--> statement-breakpoint
CREATE INDEX "installments_due_idx" ON "installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));