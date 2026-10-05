"use server";

import { refresh } from "next/cache";
import { ZodError } from "zod";
import { parseAmount } from "@/lib/format";
import { createCustomer, getCustomer, setCustomerBlocked, updateCustomer, type CustomerInput } from "@/server/customers/service";
import { AppError } from "@/server/errors";
import { fieldErrors } from "@/server/http";

export type DuplicateCustomer = {
  field: "phone" | "nationalId";
  code: string;
  fullName: string;
  activeContracts: number;
  outstanding: number;
};

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  duplicate?: DuplicateCustomer;
  saved?: { code: string };
};

const textFields = [
  "fullName",
  "phone",
  "altPhone",
  "whatsapp",
  "nationalId",
  "address",
  "employer",
  "jobTitle",
  "emergencyContactName",
  "emergencyContactPhone",
  "guarantorName",
  "guarantorPhone",
  "guarantorRelation",
  "guarantorAddress",
] as const;

/** Form values → service input. The form takes the income in pounds; the service wants piastres. */
function readForm(form: FormData): { input: Partial<CustomerInput>; errors: Record<string, string> } {
  const input: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const name of textFields) input[name] = String(form.get(name) ?? "");

  const income = String(form.get("monthlyIncome") ?? "").trim();
  if (!income) input.monthlyIncome = null;
  else {
    input.monthlyIncome = parseAmount(income);
    if (input.monthlyIncome === null) errors.monthlyIncome = "أدخل الدخل بالأرقام (مثال: 15000)";
  }

  return { input: input as Partial<CustomerInput>, errors };
}

async function toFormState(error: unknown): Promise<CustomerFormState> {
  if (error instanceof ZodError) return { fieldErrors: fieldErrors(error) };
  if (error instanceof AppError) {
    const details = error.details as
      | { fieldErrors?: Record<string, string>; field?: DuplicateCustomer["field"]; existing?: { code: string; fullName: string } }
      | undefined;
    if (error.code === "conflict" && details?.existing && details.field) {
      const existing = await getCustomer(details.existing.code);
      return {
        duplicate: {
          field: details.field,
          code: existing.code,
          fullName: existing.fullName,
          activeContracts: existing.balances.activeContracts,
          outstanding: existing.balances.outstanding,
        },
      };
    }
    return { error: error.message, fieldErrors: details?.fieldErrors };
  }
  throw error;
}

/** Creates a customer, or updates `code` when given. Permissions are checked by the service. */
export async function saveCustomerAction(code: string | null, form: FormData): Promise<CustomerFormState> {
  const { input, errors } = readForm(form);
  if (Object.keys(errors).length) return { fieldErrors: errors };
  try {
    if (code === null) {
      const created = await createCustomer(input as CustomerInput);
      return { saved: { code: created.code } };
    }
    // The edit form never shows the stored national ID; blank means "keep it".
    if (!input.nationalId) delete input.nationalId;
    const updated = await updateCustomer(code, input);
    return { saved: { code: updated.code } };
  } catch (error) {
    return toFormState(error);
  }
}

export async function setCustomerBlockedAction(code: string, blocked: boolean, reason: string): Promise<{ error?: string }> {
  try {
    await setCustomerBlocked(code, { blocked, reason });
  } catch (error) {
    if (error instanceof ZodError) return { error: Object.values(fieldErrors(error))[0] };
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refresh();
  return {};
}
