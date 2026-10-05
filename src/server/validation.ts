import { z } from "zod";
import { parseIsoDate } from "@/server/finance/schedule";

/** Egyptian mobile: accepts 0100 123 4567, +20 100…, 0020 100…; normalizes to 01001234567. */
export function normalizeEgyptianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, "").replace(/^(\+|00)20/, "0").replace(/^20(?=1)/, "0");
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeEgyptianMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "رقم موبايل مصري غير صحيح (مثال: 01001234567)" });
      return z.NEVER;
    }
    return normalized;
  });

/** 14-digit Egyptian national ID; first digit is the century (2 = 1900s, 3 = 2000s). */
export const nationalIdSchema = z
  .string()
  .trim()
  .regex(/^[23]\d{13}$/, { error: "الرقم القومي 14 رقمًا ويبدأ بـ 2 أو 3" });

export function maskNationalId(id: string | null): string | null {
  return id ? `${id.slice(0, 3)}${"*".repeat(id.length - 3)}` : null;
}

/** Integer piastres (1 EGP = 100). */
export const moneySchema = z.number().int({ error: "المبالغ بالقرش كأعداد صحيحة" }).nonnegative();

export const isoDateSchema = z.string().refine(
  (v) => {
    try {
      parseIsoDate(v);
      return true;
    } catch {
      return false;
    }
  },
  { error: "تاريخ غير صحيح (YYYY-MM-DD)" },
);

/** Optional text: trims, and turns "" into null so clearing a field works. */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullish();

export const pageSchema = z.coerce.number().int().min(1).catch(1);
export const PAGE_SIZE = 20;
