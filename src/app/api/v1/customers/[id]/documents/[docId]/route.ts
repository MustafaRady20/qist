import { openCustomerDocument } from "@/server/customers/documents";
import { route } from "@/server/http";

/** Streams the file inline (PDF / image) to staff allowed to open documents. */
export const GET = route(async (_req, ctx: RouteContext<"/api/v1/customers/[id]/documents/[docId]">) => {
  const { id, docId } = await ctx.params;
  const doc = await openCustomerDocument(id, docId);
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.data.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
