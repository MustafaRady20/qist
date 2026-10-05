import { NextResponse } from "next/server";
import { z } from "zod";
import { createCustomer, listCustomers, type CustomerInput } from "@/server/customers/service";
import { parseQuery, readJson, route } from "@/server/http";
import { pageSchema } from "@/server/validation";

const listQuery = z.object({
  tab: z.enum(["all", "active", "noBalance", "overdue", "multi", "new"]).catch("all"),
  q: z.string().optional(),
  page: pageSchema,
});

export const GET = route(async (req) => NextResponse.json(await listCustomers(parseQuery(req, listQuery))));

export const POST = route(async (req) =>
  NextResponse.json(await createCustomer((await readJson(req)) as CustomerInput), { status: 201 }),
);
