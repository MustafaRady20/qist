import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/dal";
import { permissions } from "@/server/auth/permissions";
import { route } from "@/server/http";

export const GET = route(async () => {
  const user = await requireUser();
  const granted = Object.entries(permissions)
    .filter(([, roles]) => (roles as readonly string[]).includes(user.role))
    .map(([p]) => p);
  return NextResponse.json({ user, permissions: granted });
});
