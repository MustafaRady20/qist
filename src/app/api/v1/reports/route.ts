import { NextResponse } from "next/server";
import { listReports } from "@/server/reports/service";
import { route } from "@/server/http";

export const GET = route(async () => NextResponse.json({ items: await listReports() }));
