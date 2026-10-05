import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DOCUMENT_OPENED, recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/dal";
import { db } from "@/server/db";
import { customerDocuments, customers, documentKind, users, type DocumentKind } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { getFile, putFile } from "@/server/storage";
import { DOCUMENT_TOO_LARGE, documentKindLabels, MAX_DOCUMENT_BYTES } from "@/lib/documents";

export { MAX_DOCUMENT_BYTES };

const kindSchema = z.enum(documentKind.enumValues, { error: "اختر نوع المستند" });

/** The type is decided by the file's leading bytes, not its name or the browser's claim. */
function sniff(data: Buffer): { mimeType: string; ext: string } | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return { mimeType: "application/pdf", ext: ".pdf" };
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mimeType: "image/jpeg", ext: ".jpg" };
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", ext: ".png" };
  }
  return null;
}

function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150) || "document";
}

async function findCustomerRef(idOrCode: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrCode);
  const [customer] = await db
    .select({ id: customers.id, code: customers.code })
    .from(customers)
    .where(isUuid ? eq(customers.id, idOrCode) : eq(customers.code, idOrCode.toUpperCase()))
    .limit(1);
  if (!customer) throw notFound("العميل");
  return customer;
}

export type CustomerDocumentItem = {
  id: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: Date;
};

/** Document list (names and dates only); opening a file needs `customers:documents`. */
export async function listCustomerDocuments(idOrCode: string): Promise<CustomerDocumentItem[]> {
  await requirePermission("customers:read");
  const customer = await findCustomerRef(idOrCode);
  return db
    .select({
      id: customerDocuments.id,
      kind: customerDocuments.kind,
      fileName: customerDocuments.fileName,
      mimeType: customerDocuments.mimeType,
      sizeBytes: customerDocuments.sizeBytes,
      uploadedByName: users.name,
      createdAt: customerDocuments.createdAt,
    })
    .from(customerDocuments)
    .leftJoin(users, eq(users.id, customerDocuments.uploadedBy))
    .where(eq(customerDocuments.customerId, customer.id))
    .orderBy(desc(customerDocuments.createdAt));
}

export async function uploadCustomerDocument(idOrCode: string, input: { kind: unknown; file: unknown }) {
  const actor = await requirePermission("customers:documents");
  const kind = kindSchema.parse(input.kind);
  const file = input.file;
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("validation", "اختر ملفًا للرفع", { fieldErrors: { file: "اختر ملفًا للرفع" } });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new AppError("validation", DOCUMENT_TOO_LARGE, { fieldErrors: { file: DOCUMENT_TOO_LARGE } });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniff(data);
  if (!type) {
    throw new AppError("validation", "نوع الملف غير مدعوم. ارفع PDF أو JPG أو PNG", {
      fieldErrors: { file: "نوع الملف غير مدعوم. ارفع PDF أو JPG أو PNG" },
    });
  }

  const customer = await findCustomerRef(idOrCode);
  const storageKey = `customers/${customer.id}/${randomUUID()}${type.ext}`;
  await putFile(storageKey, data);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(customerDocuments)
      .values({
        customerId: customer.id,
        kind,
        fileName: cleanFileName(file.name),
        mimeType: type.mimeType,
        sizeBytes: data.length,
        storageKey,
        uploadedBy: actor.id,
      })
      .returning({
        id: customerDocuments.id,
        kind: customerDocuments.kind,
        fileName: customerDocuments.fileName,
        mimeType: customerDocuments.mimeType,
        sizeBytes: customerDocuments.sizeBytes,
        createdAt: customerDocuments.createdAt,
      });
    await recordAudit(
      {
        actorId: actor.id,
        action: "رفع مستند",
        entityType: "customer",
        entityId: customer.id,
        ref: customer.code,
        after: { document: created.fileName, kind: documentKindLabels[kind] },
      },
      tx,
    );
    return created;
  });
}

/** File contents for download. Every open is audited: these are identity documents. */
export async function openCustomerDocument(idOrCode: string, documentId: string) {
  const actor = await requirePermission("customers:documents");
  const customer = await findCustomerRef(idOrCode);
  if (!z.uuid().safeParse(documentId).success) throw notFound("المستند");
  const [doc] = await db
    .select()
    .from(customerDocuments)
    .where(and(eq(customerDocuments.id, documentId), eq(customerDocuments.customerId, customer.id)))
    .limit(1);
  if (!doc) throw notFound("المستند");

  let data: Buffer;
  try {
    data = await getFile(doc.storageKey);
  } catch {
    throw notFound("ملف المستند");
  }
  await recordAudit({
    actorId: actor.id,
    action: DOCUMENT_OPENED,
    entityType: "customer",
    entityId: customer.id,
    ref: customer.code,
    after: { document: doc.fileName },
  });
  return { fileName: doc.fileName, mimeType: doc.mimeType, data };
}
