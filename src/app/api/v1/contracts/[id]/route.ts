import { NextResponse } from "next/server";
import { getContract, updateDraft, type ContractInput } from "@/server/contracts/service";
import { readJson, route } from "@/server/http";

type Ctx = RouteContext<"/api/v1/contracts/[id]">;

/** `id` may be the UUID or the contract code (CT-1024). */
export const GET = route(async (_req, ctx: Ctx) => NextResponse.json(await getContract((await ctx.params).id)));

/** Replaces a draft's plan. Confirmed contracts cannot be edited. */
export const PUT = route(async (req, ctx: Ctx) =>
  NextResponse.json(await updateDraft((await ctx.params).id, (await readJson(req)) as ContractInput)),
);
