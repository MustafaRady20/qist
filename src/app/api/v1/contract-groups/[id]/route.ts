import { NextResponse } from "next/server";
import { dissolveContractGroup, getContractGroup } from "@/server/contracts/groups";
import { listContracts } from "@/server/contracts/service";
import { route } from "@/server/http";

type Ctx = RouteContext<"/api/v1/contract-groups/[id]">;

export const GET = route(async (_req, ctx: Ctx) => {
  const group = await getContractGroup((await ctx.params).id);
  const contracts = await listContracts({ tab: "consolidated", customerId: group.customerId });
  return NextResponse.json({ ...group, contracts: contracts.items.filter((c) => c.groupId === group.id) });
});

/** Ungroups the contracts; they are not changed. */
export const DELETE = route(async (_req, ctx: Ctx) => {
  await dissolveContractGroup((await ctx.params).id);
  return new NextResponse(null, { status: 204 });
});
