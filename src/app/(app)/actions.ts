"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie, SESSION_COOKIE } from "@/server/auth/session";
import { logout } from "@/server/auth/service";

export async function logoutAction() {
  await logout((await cookies()).get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/login");
}
