import { NextResponse } from "next/server";
import { z } from "zod";
import { getReport, reportPresets, reportToCsv } from "@/server/reports/service";
import { parseQuery, route } from "@/server/http";

type Ctx = RouteContext<"/api/v1/reports/[slug]">;

const query = z.object({
  period: z.enum(reportPresets).catch("year"),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["json", "csv"]).catch("json"),
});

/** `?format=csv` downloads the full table (amounts in pounds); JSON keeps piastres. */
export const GET = route(async (req, ctx: Ctx) => {
  const { format, ...params } = parseQuery(req, query);
  const report = await getReport((await ctx.params).slug, params);
  if (format === "json") return NextResponse.json(report);

  const name = report.range ? `${report.slug}_${report.range.from}_${report.range.to}` : `${report.slug}_${report.asOf}`;
  return new Response(reportToCsv(report), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qist-${name}.csv"`,
      "cache-control": "no-store",
    },
  });
});
