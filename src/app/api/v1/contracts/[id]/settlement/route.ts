import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSettlementQuote, settleContract, type settlementInputSchema } from "@/server/contracts/settlement";
import { readJson, route } from "@/server/http";

type Ctx = RouteContext<"/api/v1/contracts/[id]/settlement">;

/** Early-settlement quote for today. Nothing is saved. */
export const GET = route(async (_req, ctx: Ctx) => NextResponse.json(await getSettlementQuote((await ctx.params).id)));

/** POST { expectedAmount, reason, paymentMethod, paymentReference?, password } — receives the amount and closes the contract. */
export const POST = route(async (req, ctx: Ctx) =>
  NextResponse.json(await settleContract((await ctx.params).id, (await readJson(req)) as z.input<typeof settlementInputSchema>), { status: 201 }),
);
