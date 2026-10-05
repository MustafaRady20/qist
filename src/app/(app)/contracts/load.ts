import "server-only";
import { notFound } from "next/navigation";
import { getContract } from "@/server/contracts/service";
import { listCustomers } from "@/server/customers/service";
import { AppError } from "@/server/errors";
import { listUsableRules } from "@/server/finance-rules/service";
import type { CustomerOption } from "./actions";
import type { RuleOption } from "./ContractWizard";

/** Runs a service read for a page, rendering the 404 page when the record doesn't exist. */
export async function orNotFound<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
}

export function loadContract(idOrCode: string) {
  return orNotFound(() => getContract(decodeURIComponent(idOrCode)));
}

/** The customer as the wizard shows them (with balances), looked up by exact code. */
export async function loadCustomerOption(code: string): Promise<CustomerOption | undefined> {
  const { items } = await listCustomers({ q: code });
  return items.find((c) => c.code === code.toUpperCase());
}

export async function loadRuleOptions(): Promise<RuleOption[]> {
  const rules = await listUsableRules();
  return rules.map(({ id, name, version, annualRateBp, minTermMonths, maxTermMonths, minDownPaymentBp }) => ({
    id,
    name,
    version,
    annualRateBp,
    minTermMonths,
    maxTermMonths,
    minDownPaymentBp,
  }));
}
