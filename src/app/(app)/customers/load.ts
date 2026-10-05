import "server-only";
import { notFound } from "next/navigation";
import { getCustomer } from "@/server/customers/service";
import { AppError } from "@/server/errors";

/** Loads the customer for a page, rendering the 404 page for an unknown id or code. */
export async function loadCustomer(idOrCode: string) {
  try {
    return await getCustomer(decodeURIComponent(idOrCode));
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
}
