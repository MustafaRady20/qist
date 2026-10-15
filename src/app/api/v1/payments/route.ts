import { NextResponse } from "next/server";
import { z } from "zod";
import { parseQuery, readJson, route } from "@/server/http";
import { listPayments, recordPayment, type PaymentInput } from "@/server/payments/service";
import { pageSchema } from "@/server/validation";

const query = z.object({ q: z.string().optional(), page: pageSchema });

/** Recorded payments and reversals, newest first. */
export const GET = route(async (req) => NextResponse.json(await listPayments(parseQuery(req, query))));

/**
 * POST { contract, amount, method, reference?, paidOn?, note?, idempotencyKey? } — receives money on an
 * active contract. Repeating a request with the same idempotencyKey returns the first payment (200).
 */
export const POST = route(async (req) => {
  const result = await recordPayment((await readJson(req)) as PaymentInput);
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
});
