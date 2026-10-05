CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'wallet');--> statement-breakpoint
CREATE TABLE "contract_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dissolved_at" timestamp with time zone,
	"dissolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "contract_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"remaining_principal" bigint NOT NULL,
	"accrued_profit" bigint NOT NULL,
	"waived_profit" bigint NOT NULL,
	"outstanding_fees" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"policy" text NOT NULL,
	"reason" text NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_reference" text,
	"settled_on" date NOT NULL,
	"settled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_settlements_amount_check" CHECK ("contract_settlements"."amount" = "contract_settlements"."remaining_principal" + "contract_settlements"."accrued_profit" + "contract_settlements"."outstanding_fees")
);
--> statement-breakpoint
ALTER TABLE "installments" DROP CONSTRAINT "installments_paid_check";--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "installments" ADD COLUMN "waived_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_groups" ADD CONSTRAINT "contract_groups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_groups" ADD CONSTRAINT "contract_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_groups" ADD CONSTRAINT "contract_groups_dissolved_by_users_id_fk" FOREIGN KEY ("dissolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_settlements" ADD CONSTRAINT "contract_settlements_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_settlements" ADD CONSTRAINT "contract_settlements_settled_by_users_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_groups_customer_idx" ON "contract_groups" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_settlements_contract_key" ON "contract_settlements" USING btree ("contract_id");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_group_id_contract_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contract_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_group_idx" ON "contracts" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_paid_check" CHECK ("installments"."paid_amount" >= 0 AND "installments"."waived_amount" >= 0 AND "installments"."paid_amount" + "installments"."waived_amount" <= "installments"."amount");