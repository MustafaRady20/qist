CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'reversal');--> statement-breakpoint
CREATE SEQUENCE "public"."payment_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_installment_id_pk" PRIMARY KEY("payment_id","installment_id"),
	CONSTRAINT "payment_allocations_amount_check" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'PAY-' || nextval('payment_code_seq') NOT NULL,
	"contract_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"amount" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"paid_on" date NOT NULL,
	"note" text,
	"reverses_id" uuid,
	"idempotency_key" uuid,
	"received_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_reversal_check" CHECK (("payments"."kind" = 'reversal') = ("payments"."reverses_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reverses_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocations_installment_idx" ON "payment_allocations" USING btree ("installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_code_key" ON "payments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reverses_key" ON "payments" USING btree ("reverses_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_contract_idx" ON "payments" USING btree ("contract_id","paid_on");--> statement-breakpoint
-- Backfill: amounts already marked paid on installments before payments were recorded
-- (early settlements keep their own row in contract_settlements and are not repeated).
-- One opening payment per installment, dated on its due date, so the ledger reconciles with paid_amount.
WITH src AS (
	SELECT gen_random_uuid() AS payment_id, i.id AS installment_id, i.contract_id, i.paid_amount, LEAST(i.due_date, CURRENT_DATE) AS paid_on
	FROM "installments" i
	JOIN "contracts" c ON c.id = i.contract_id
	WHERE i.paid_amount > 0 AND c.status <> 'settled'
), p AS (
	INSERT INTO "payments" ("id", "contract_id", "kind", "amount", "method", "paid_on", "note")
	SELECT payment_id, contract_id, 'payment', paid_amount, 'cash', paid_on, 'رصيد مُرحّل قبل تفعيل سجل المدفوعات'
	FROM src
)
INSERT INTO "payment_allocations" ("payment_id", "installment_id", "amount")
SELECT payment_id, installment_id, paid_amount FROM src;
