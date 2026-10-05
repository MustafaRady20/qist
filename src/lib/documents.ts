import type { DocumentKind } from "@/server/db/schema";

/**
 * Upload limit in MB. Serverless hosts cap the request body (Vercel: 4.5 MB),
 * so deployments there set NEXT_PUBLIC_MAX_DOCUMENT_MB=4.
 */
export const MAX_DOCUMENT_MB = Number(process.env.NEXT_PUBLIC_MAX_DOCUMENT_MB) || 10;
export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024;
export const DOCUMENT_TOO_LARGE = `حجم الملف أكبر من ${MAX_DOCUMENT_MB} MB`;
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png";

export const documentKindLabels: Record<DocumentKind, string> = {
  national_id: "هوية",
  income_proof: "إثبات دخل",
  contract: "عقد",
  guarantor_id: "هوية الضامن",
  other: "أخرى",
};
