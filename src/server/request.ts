import "server-only";
import { headers } from "next/headers";

export type RequestMeta = { ip?: string; userAgent?: string };

/** Client IP and user agent for audit entries and sessions. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  return { ip, userAgent: h.get("user-agent") ?? undefined };
}
