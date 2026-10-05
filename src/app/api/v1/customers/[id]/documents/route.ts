import { NextResponse } from "next/server";
import { listCustomerDocuments, MAX_DOCUMENT_BYTES, uploadCustomerDocument } from "@/server/customers/documents";
import { AppError } from "@/server/errors";
import { route } from "@/server/http";
import { DOCUMENT_TOO_LARGE } from "@/lib/documents";

type Ctx = RouteContext<"/api/v1/customers/[id]/documents">;

export const GET = route(async (_req, ctx: Ctx) => NextResponse.json(await listCustomerDocuments((await ctx.params).id)));

/** POST multipart/form-data { kind, file } — PDF / JPG / PNG up to MAX_DOCUMENT_MB. */
export const POST = route(async (req, ctx: Ctx) => {
  // Refuse oversized bodies before buffering them (the service re-checks the real size).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES + 64 * 1024) {
    throw new AppError("validation", DOCUMENT_TOO_LARGE, { fieldErrors: { file: DOCUMENT_TOO_LARGE } });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("validation", "أرسل الملف بصيغة multipart/form-data");
  }
  const created = await uploadCustomerDocument((await ctx.params).id, { kind: form.get("kind"), file: form.get("file") });
  return NextResponse.json(created, { status: 201 });
});
