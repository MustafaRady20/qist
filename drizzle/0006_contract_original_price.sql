ALTER TABLE "contracts" ADD COLUMN "original_price" bigint;--> statement-breakpoint
-- Existing contracts had a single price: it is both what the goods cost and what the customer was charged.
UPDATE "contracts" SET "original_price" = "purchase_cost";--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "original_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_original_price_check" CHECK ("contracts"."original_price" > 0);
