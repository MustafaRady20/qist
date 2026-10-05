import { NextResponse } from "next/server";
import { z } from "zod";
import { listAuditLog } from "@/server/audit-log/service";
import { parseQuery, route } from "@/server/http";
import { pageSchema } from "@/server/validation";

const listQuery = z.object({ q: z.string().optional(), page: pageSchema });

export const GET = route(async (req) => NextResponse.json(await listAuditLog(parseQuery(req, listQuery))));
