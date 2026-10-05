import { NextResponse } from "next/server";
import { z } from "zod";
import { createContract, listContracts, type ContractInput } from "@/server/contracts/service";
import { parseQuery, readJson, route } from "@/server/http";
import { pageSchema } from "@/server/validation";

const listQuery = z.object({
  tab: z.enum(["active", "draft", "completed", "overdue", "settled", "consolidated"]).catch("active"),
  q: z.string().optional(),
  customerId: z.uuid().optional(),
  page: pageSchema,
});

export const GET = route(async (req) => NextResponse.json(await listContracts(parseQuery(req, listQuery))));

/** POST { ...ContractInput, confirm?: boolean } — confirm=false saves a draft. */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as ContractInput & { confirm?: boolean };
  const { confirm = false, ...input } = body ?? {};
  return NextResponse.json(await createContract(input as ContractInput, { confirm: confirm === true }), { status: 201 });
});
