import type { UserRole } from "@/server/db/schema";

/**
 * Role → permission matrix. "صاحب الحساب" (owner) can do everything;
 * collectors work receivables; viewers are read-only.
 */
export const permissions = {
  "customers:read": ["owner", "manager", "collector", "viewer"],
  "customers:write": ["owner", "manager"],
  "customers:block": ["owner", "manager"],
  // Upload and open scanned documents (IDs, income proof).
  "customers:documents": ["owner", "manager"],
  "contracts:read": ["owner", "manager", "collector", "viewer"],
  "contracts:write": ["owner", "manager"],
  "contracts:confirm": ["owner", "manager"],
  // Early settlement closes a contract and forgives future profit.
  "contracts:settle": ["owner", "manager"],
  // Receive installment money; reversing a recorded payment is a correction for managers.
  "payments:write": ["owner", "manager", "collector"],
  "payments:reverse": ["owner", "manager"],
  "finance-rules:read": ["owner", "manager", "collector", "viewer"],
  "finance-rules:write": ["owner"],
  "audit:read": ["owner", "manager"],
  // Portfolio-wide financial analytics and exports.
  "reports:read": ["owner", "manager", "viewer"],
  "users:manage": ["owner"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof permissions;

export function can(role: UserRole, permission: Permission): boolean {
  return (permissions[permission] as readonly UserRole[]).includes(role);
}

export const roleLabels: Record<UserRole, string> = {
  owner: "صاحب الحساب",
  manager: "مدير",
  collector: "محصّل",
  viewer: "مشاهد",
};
