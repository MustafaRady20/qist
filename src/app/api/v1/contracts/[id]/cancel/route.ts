import { NextResponse } from "next/server";
import { cancelDraft } from "@/server/contracts/service";
import { readJson, route } from "@/server/http";

/** POST { reason } — cancels a draft (never deleted). */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/contracts/[id]/cancel">) => {
  const { reason } = ((await readJson(req)) ?? {}) as { reason?: string };
  return NextResponse.json(await cancelDraft((await ctx.params).id, reason ?? ""));
});
