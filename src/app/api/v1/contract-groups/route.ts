import { NextResponse } from "next/server";
import type { z } from "zod";
import { createContractGroup, type groupInputSchema } from "@/server/contracts/groups";
import { readJson, route } from "@/server/http";

/** POST { customerId, contractIds[], name, note? } — groups active contracts of one customer for follow-up. */
export const POST = route(async (req) =>
  NextResponse.json(await createContractGroup((await readJson(req)) as z.input<typeof groupInputSchema>), { status: 201 }),
);
