import { NextResponse } from "next/server";
import { z } from "zod";
import { dashboardPeriods, getDashboard } from "@/server/dashboard/service";
import { parseQuery, route } from "@/server/http";

const query = z.object({
  period: z.enum(dashboardPeriods).catch("month"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = route(async (req) => NextResponse.json(await getDashboard(parseQuery(req, query))));
