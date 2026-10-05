"use server";

import { refresh } from "next/cache";
import { ZodError, type z } from "zod";
import { createContractGroup, dissolveContractGroup, type groupInputSchema } from "@/server/contracts/groups";
import { cancelDraft, confirmDraft, createContract, updateDraft, type ContractInput } from "@/server/contracts/service";
import { settleContract, type settlementInputSchema } from "@/server/contracts/settlement";
import { listCustomers, type CustomerListItem } from "@/server/customers/service";
import { AppError } from "@/server/errors";
import { fieldErrors } from "@/server/http";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Services check permissions and validate; this turns their errors into something a form can show. */
async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
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

export type CustomerOption = Pick<CustomerListItem, "id" | "code" | "fullName" | "phone" | "activeContracts" | "outstanding" | "overdue" | "status">;

/** Customer picker of the contract wizard (step 1). */
export async function searchCustomersAction(q: string): Promise<CustomerOption[]> {
  const { items } = await listCustomers({ q: q.trim().slice(0, 80) || undefined });
  return items.slice(0, 8).map(({ id, code, fullName, phone, activeContracts, outstanding, overdue, status }) => ({
    id,
    code,
    fullName,
    phone,
    activeContracts,
    outstanding,
    overdue,
    status,
  }));
}

/** Wizard save: creates (or updates the draft `draftCode`), as a draft or as a confirmed contract. */
export async function saveContractAction(draftCode: string | null, input: ContractInput, confirm: boolean) {
  return run(async () => {
    if (draftCode === null) {
      const { contract } = await createContract(input, { confirm });
      return { code: contract.code };
    }
    await updateDraft(draftCode, input);
    if (confirm) await confirmDraft(draftCode);
    return { code: draftCode };
  });
}

export async function confirmDraftAction(code: string) {
  const result = await run(async () => {
    await confirmDraft(code);
    return {};
  });
  if (result.ok) refresh();
  return result;
}

export async function cancelDraftAction(code: string, reason: string) {
  const result = await run(async () => {
    await cancelDraft(code, reason);
    return {};
  });
  if (result.ok) refresh();
  return result;
}

export async function settleContractAction(code: string, input: z.input<typeof settlementInputSchema>) {
  return run(async () => {
    await settleContract(code, input);
    return {};
  });
}

export async function createGroupAction(input: z.input<typeof groupInputSchema>) {
  return run(async () => {
    const group = await createContractGroup(input);
    return { id: group.id };
  });
}

export async function dissolveGroupAction(id: string) {
  const result = await run(async () => {
    await dissolveContractGroup(id);
    return {};
  });
  if (result.ok) refresh();
  return result;
}
