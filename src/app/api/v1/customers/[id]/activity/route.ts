import { NextResponse } from "next/server";
import { listCustomerActivity } from "@/server/customers/service";
import { route } from "@/server/http";

export const GET = route(async (_req, ctx: RouteContext<"/api/v1/customers/[id]/activity">) =>
  NextResponse.json(await listCustomerActivity((await ctx.params).id)),
);
