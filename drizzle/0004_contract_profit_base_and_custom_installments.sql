CREATE TYPE "public"."profit_base" AS ENUM('principal', 'purchase_cost');--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "profit_base" "profit_base" DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "custom_installments" jsonb DEFAULT '[]'::jsonb NOT NULL;