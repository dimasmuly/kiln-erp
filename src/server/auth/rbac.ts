/**
 * Role-based access control. Checked in the service layer (not only in the
 * UI), so every entry point is authorized the same way: pages, server
 * actions, scripts and tests.
 */

export const ROLES = ["admin", "sales", "purchasing", "warehouse", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "sales.read",
  "sales.write",
  "sales.deliver",
  "sales.invoice",
  "sales.payment",
  "purchasing.read",
  "purchasing.write",
  "purchasing.receive",
  "purchasing.payment",
  "inventory.read",
  "inventory.write",
  "masterdata.write",
  "accounting.read",
  "admin.users",
  "admin.system",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  sales: ["sales.read", "sales.write", "inventory.read", "masterdata.write"],
  purchasing: ["purchasing.read", "purchasing.write", "inventory.read", "masterdata.write"],
  warehouse: [
    "sales.read",
    "sales.deliver",
    "purchasing.read",
    "purchasing.receive",
    "inventory.read",
    "inventory.write",
  ],
  finance: [
    "sales.read",
    "sales.invoice",
    "sales.payment",
    "purchasing.read",
    "purchasing.payment",
    "inventory.read",
    "accounting.read",
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  sales: "Sales",
  purchasing: "Purchasing",
  warehouse: "Warehouse",
  finance: "Finance",
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
