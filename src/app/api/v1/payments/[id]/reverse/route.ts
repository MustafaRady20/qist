import { NextResponse } from "next/server";
import { readJson, route } from "@/server/http";
import { reversePayment } from "@/server/payments/service";

type Ctx = RouteContext<"/api/v1/payments/[id]/reverse">;

/** POST { reason } — cancels a payment with a reversing entry (`id` = UUID or PAY-1001). */
export const POST = route(async (req, ctx: Ctx) => {
  const body = (await readJson(req)) as { reason?: string };
  return NextResponse.json(await reversePayment((await ctx.params).id, body?.reason ?? ""), { status: 201 });
});
