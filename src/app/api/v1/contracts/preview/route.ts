import { NextResponse } from "next/server";
import { previewContract, type ContractInput } from "@/server/contracts/service";
import { readJson, route } from "@/server/http";

/** Calculates the plan and schedule without saving (wizard steps 4–6). */
export const POST = route(async (req) => NextResponse.json(await previewContract((await readJson(req)) as ContractInput)));
