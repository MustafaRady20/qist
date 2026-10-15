"use server";

import { refresh } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { fieldErrors } from "@/server/http";
import { recordPayment, reversePayment, type PaymentInput } from "@/server/payments/service";

export type PaymentActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** The service checks permissions and validates; this turns its errors into something a form can show. */
async function run<T extends object>(fn: () => Promise<T>): Promise<PaymentActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (error) {
    if (error instanceof ZodError) {
      const fields = fieldErrors(error);
      return { ok: false, error: Object.values(fields)[0] ?? "راجع البيانات المدخلة", fieldErrors: fields };
    }
    if (error instanceof AppError) {
      const fields = (error.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors;
      return { ok: false, error: error.message, fieldErrors: fields };
    }
    throw error;
  }
}

export async function recordPaymentAction(input: PaymentInput) {
  return run(async () => {
    const { payment } = await recordPayment(input);
    return { code: payment.code };
  });
}

export async function reversePaymentAction(paymentId: string, reason: string) {
  const result = await run(async () => {
    await reversePayment(paymentId, reason);
    return {};
  });
  if (result.ok) refresh();
  return result;
}
