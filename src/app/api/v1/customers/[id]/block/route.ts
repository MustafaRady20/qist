import { NextResponse } from "next/server";
import { setCustomerBlocked } from "@/server/customers/service";
import { readJson, route } from "@/server/http";

/** POST { blocked: boolean, reason } */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/customers/[id]/block">) =>
  NextResponse.json(
    await setCustomerBlocked((await ctx.params).id, (await readJson(req)) as { blocked: boolean; reason: string }),
  ),
);
