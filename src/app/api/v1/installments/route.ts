import { NextResponse } from "next/server";
import { z } from "zod";
import { getInstallmentSummary, installmentTabs, listInstallments } from "@/server/installments/service";
import { parseQuery, route } from "@/server/http";
import { pageSchema } from "@/server/validation";

const listQuery = z.object({
  tab: z.enum(installmentTabs).catch("all"),
  q: z.string().optional(),
  page: pageSchema,
});

export const GET = route(async (req) => {
  const [list, summary] = await Promise.all([listInstallments(parseQuery(req, listQuery)), getInstallmentSummary()]);
  return NextResponse.json({ ...list, summary });
});
