import "server-only";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { getCustomer, type CustomerDetail } from "@/server/customers/service";
import { db } from "@/server/db";
import { contracts, contractSettlements, installments, paymentAllocations, payments } from "@/server/db/schema";
import { isIsoDate, previousRange, resolveRange } from "@/server/finance/period";
import {
  buildStatement,
  statementEntryTypes,
  statementInstallmentFilters,
  type Statement,
  type StatementContract,
  type StatementEntryType,
  type StatementInstallmentFilter,
} from "@/server/finance/statement";
import { todayInCairo } from "@/server/time";

export const statementPeriods = ["all", "month", "lastMonth", "custom"] as const;
export type StatementPeriod = (typeof statementPeriods)[number];

export type StatementParams = {
  period?: StatementPeriod;
  from?: unknown;
  to?: unknown;
  type?: unknown;
  /** Contract UUID or code. */
  contract?: unknown;
  installments?: unknown;
};

export type CustomerStatement = Statement & {
  customer: Pick<CustomerDetail, "id" | "code" | "fullName" | "phone" | "altPhone" | "whatsapp" | "address" | "status">;
  filters: {
    period: StatementPeriod;
    type: StatementEntryType | null;
    contract: string | null;
    installments: StatementInstallmentFilter | null;
  };
};

const oneOf = <T extends string>(values: readonly T[], v: unknown): T | undefined => values.find((x) => x === v);

/**
 * Account statement of one customer: summary, ledger with running balance for
 * the chosen period, and every plan with its installments. Needs the same
 * access as the customer file and its contracts.
 */
export async function getCustomerStatement(idOrCode: string, params: StatementParams = {}): Promise<CustomerStatement> {
  const customer = await getCustomer(idOrCode);
  await requirePermission("contracts:read");
  const today = todayInCairo();

  const confirmed = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.customerId, customer.id), notInArray(contracts.status, ["draft", "cancelled"])))
    .orderBy(asc(contracts.createdAt));
  const ids = confirmed.map((c) => c.id);
  const [schedule, paid, settled] = ids.length
    ? await Promise.all([
        db.select().from(installments).where(inArray(installments.contractId, ids)),
        db.select().from(payments).where(inArray(payments.contractId, ids)),
        db.select().from(contractSettlements).where(inArray(contractSettlements.contractId, ids)),
      ])
    : [[], [], []];
  const allocations = paid.length
    ? await db
        .select()
        .from(paymentAllocations)
        .where(
          inArray(
            paymentAllocations.paymentId,
            paid.map((p) => p.id),
          ),
        )
    : [];

  const period = oneOf(statementPeriods, params.period) ?? "all";
  let range: { from?: string; to?: string } = {};
  if (period === "month") range = resolveRange("month", today);
  else if (period === "lastMonth") range = previousRange(resolveRange("month", today));
  else if (period === "custom") {
    // Either end may be left open; an inverted range is read as "from" only.
    const from = isIsoDate(params.from) ? params.from : undefined;
    const to = isIsoDate(params.to) && (!from || params.to >= from) ? params.to : undefined;
    range = { from, to };
  }

  const wanted = typeof params.contract === "string" ? params.contract.trim().toUpperCase() : "";
  const contract = confirmed.find((c) => c.id.toUpperCase() === wanted || c.code === wanted);
  const type = oneOf(statementEntryTypes, params.type);
  const installmentFilter = oneOf(statementInstallmentFilters, params.installments);

  const statement = buildStatement(
    {
      contracts: confirmed.map((c): StatementContract => {
        const confirmedAt = c.confirmedAt ?? c.createdAt;
        return {
          id: c.id,
          code: c.code,
          productDescription: c.productDescription,
          status: c.status as StatementContract["status"],
          downPayment: c.downPayment,
          fees: c.fees,
          totalInstallments: c.totalInstallments,
          installmentCount: c.installmentCount,
          firstDueDate: c.firstDueDate,
          confirmedOn: todayInCairo(confirmedAt),
          confirmedAt,
        };
      }),
      installments: schedule,
      payments: paid.map((p) => ({ ...p, allocations: allocations.filter((a) => a.paymentId === p.id) })),
      settlements: settled,
    },
    { today, ...range, type, contractId: contract?.id, installments: installmentFilter },
  );

  return {
    ...statement,
    customer: {
      id: customer.id,
      code: customer.code,
      fullName: customer.fullName,
      phone: customer.phone,
      altPhone: customer.altPhone,
      whatsapp: customer.whatsapp,
      address: customer.address,
      status: customer.status,
    },
    filters: { period, type: type ?? null, contract: contract?.code ?? null, installments: installmentFilter ?? null },
  };
}
