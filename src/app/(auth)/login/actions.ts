"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { setSessionCookie } from "@/server/auth/session";
import { login } from "@/server/auth/service";
import { AppError } from "@/server/errors";
import { fieldErrors } from "@/server/http";

export type LoginState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  email?: string;
};

/** Only same-site relative paths, so `?next=` can't redirect off-site. */
function safeNext(raw: FormDataEntryValue | null) {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  try {
    const session = await login({ email, password: String(form.get("password") ?? "") });
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    if (error instanceof ZodError) return { fieldErrors: fieldErrors(error), email };
    if (error instanceof AppError) return { error: error.message, email };
    throw error;
  }
  redirect(safeNext(form.get("next")));
}
