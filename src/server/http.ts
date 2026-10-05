import "server-only";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AppError } from "@/server/errors";

/** JSON error envelope: `{ error: { code, message, details? } }`. */
export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation", message: "راجع البيانات المدخلة", details: { fieldErrors: fieldErrors(error) } } },
      { status: 422 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: { code: "internal", message: "حدث خطأ غير متوقع" } }, { status: 500 });
}

export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Wraps a route handler: maps domain errors to JSON responses and rejects
 * cross-site state-changing requests that rely on the session cookie.
 */
export function route<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOriginOrBearer(req)) {
        throw new AppError("forbidden", "طلب من مصدر غير موثوق");
      }
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function isSameOriginOrBearer(req: Request) {
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // Non-browser clients; SameSite=Lax blocks cross-site cookies anyway.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("validation", "جسم الطلب ليس JSON صالحًا");
  }
}

/** Parses URL search params (?page=2&tab=overdue) against a schema. */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}
