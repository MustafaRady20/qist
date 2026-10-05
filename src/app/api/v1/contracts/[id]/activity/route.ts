import { NextResponse } from "next/server";
import { getContract, listContractActivity } from "@/server/contracts/service";
import { route } from "@/server/http";

export const GET = route(async (_req, ctx: RouteContext<"/api/v1/contracts/[id]/activity">) => {
  const contract = await getContract((await ctx.params).id);
  return NextResponse.json(await listContractActivity(contract.id));
});
