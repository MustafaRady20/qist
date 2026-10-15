import { NextResponse } from "next/server";
import { z } from "zod";
import { statementToCsv } from "@/server/finance/statement";
import { parseQuery, route } from "@/server/http";
import { getCustomerStatement, statementPeriods } from "@/server/statements/service";

type Ctx = RouteContext<"/api/v1/customers/[id]/statement">;

const query = z.object({
  period: z.enum(statementPeriods).catch("all"),
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.string().optional(),
  contract: z.string().optional(),
  installments: z.string().optional(),
  format: z.enum(["json", "csv"]).catch("json"),
});

/** Account statement of a customer. `?format=csv` downloads the period's transactions (amounts in pounds); JSON keeps piastres. */
export const GET = route(async (req, ctx: Ctx) => {
  const { format, ...params } = parseQuery(req, query);
  const statement = await getCustomerStatement(decodeURIComponent((await ctx.params).id), params);
  if (format === "json") return NextResponse.json(statement);

  const { from, to } = statement.period;
  const span = from || to ? `${from ?? "start"}_${to ?? statement.asOf}` : `all_${statement.asOf}`;
  return new Response(statementToCsv(statement), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qist-statement-${statement.customer.code}_${span}.csv"`,
      "cache-control": "no-store",
    },
  });
});
