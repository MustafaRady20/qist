import { NextResponse } from "next/server";
import { setSessionCookie } from "@/server/auth/session";
import { changePassword, type changePasswordSchema } from "@/server/auth/service";
import { readJson, route } from "@/server/http";
import type { z } from "zod";

/** POST { currentPassword, newPassword }. Signs out all sessions and returns a fresh one. */
export const POST = route(async (req) => {
  const session = await changePassword((await readJson(req)) as z.input<typeof changePasswordSchema>);
  await setSessionCookie(session.token, session.expiresAt);
  return NextResponse.json(session);
});
