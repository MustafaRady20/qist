import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE } from "@/server/auth/session";
import { logout } from "@/server/auth/service";
import { route } from "@/server/http";

export const POST = route(async () => {
  const bearer = (await headers()).get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  await logout(bearer ?? (await cookies()).get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  return new NextResponse(null, { status: 204 });
});
