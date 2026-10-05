import { NextResponse } from "next/server";
import { listRuleVersions } from "@/server/finance-rules/service";
import { route } from "@/server/http";

export const GET = route(async (_req, ctx: RouteContext<"/api/v1/finance-rules/[key]/versions">) =>
  NextResponse.json({ items: await listRuleVersions((await ctx.params).key) }),
);
