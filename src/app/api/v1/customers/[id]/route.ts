import { NextResponse } from "next/server";
import { getCustomer, updateCustomer, type CustomerInput } from "@/server/customers/service";
import { readJson, route } from "@/server/http";

type Ctx = RouteContext<"/api/v1/customers/[id]">;

/** `id` may be the UUID or the customer code (C-1042). */
export const GET = route(async (_req, ctx: Ctx) => NextResponse.json(await getCustomer((await ctx.params).id)));

export const PATCH = route(async (req, ctx: Ctx) =>
  NextResponse.json(await updateCustomer((await ctx.params).id, (await readJson(req)) as Partial<CustomerInput>)),
);
