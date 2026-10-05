import { NextResponse } from "next/server";
import { z } from "zod";
import { createRuleVersion, listFinanceRules, listUsableRules, type ruleVersionSchema } from "@/server/finance-rules/service";
import { parseQuery, readJson, route } from "@/server/http";

const listQuery = z.object({ usable: z.enum(["true", "false"]).catch("false") });

/** GET ?usable=true → rules a new contract can use today; otherwise the latest version of every rule. */
export const GET = route(async (req) => {
  const { usable } = parseQuery(req, listQuery);
  return NextResponse.json({ items: usable === "true" ? await listUsableRules() : await listFinanceRules() });
});

/** Creates a new version of a rule (or a new rule). */
export const POST = route(async (req) =>
  NextResponse.json(await createRuleVersion((await readJson(req)) as z.input<typeof ruleVersionSchema>), { status: 201 }),
);
