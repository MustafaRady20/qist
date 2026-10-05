import { NextResponse } from "next/server";
import { setSessionCookie } from "@/server/auth/session";
import { login } from "@/server/auth/service";
import { readJson, route } from "@/server/http";

/** POST { email, password } → { token, expiresAt, user }. Also sets the session cookie for browsers. */
export const POST = route(async (req) => {
  const { token, expiresAt, user } = await login((await readJson(req)) as { email: string; password: string });
  await setSessionCookie(token, expiresAt);
  return NextResponse.json({ token, expiresAt, user });
});
