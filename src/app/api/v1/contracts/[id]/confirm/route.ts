import { NextResponse } from "next/server";
import { confirmDraft } from "@/server/contracts/service";
import { route } from "@/server/http";

export const POST = route(async (_req, ctx: RouteContext<"/api/v1/contracts/[id]/confirm">) =>
  NextResponse.json(await confirmDraft((await ctx.params).id)),
);
