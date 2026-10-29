import type { Permission } from "@/server/auth/rbac";

export type NavIcon =
  | "dashboard"
  | "orders"
  | "invoices"
  | "customers"
  | "purchase"
  | "suppliers"
  | "products"
  | "movements"
  | "count"
  | "journal"
  | "balance"
  | "users"
  | "audit"
  | "system";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  permission: Permission;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "inventory.read" }] },
  {
    section: "Sales",
    items: [
      { label: "Sales orders", href: "/sales/orders", icon: "orders", permission: "sales.read" },
      { label: "Invoices", href: "/sales/invoices", icon: "invoices", permission: "sales.read" },
      { label: "Customers", href: "/sales/customers", icon: "customers", permission: "sales.read" },
    ],
  },
  {
    section: "Purchasing",
    items: [
      { label: "Purchase orders", href: "/purchasing/orders", icon: "purchase", permission: "purchasing.read" },
      { label: "Suppliers", href: "/purchasing/suppliers", icon: "suppliers", permission: "purchasing.read" },
    ],
  },
  {
    section: "Inventory",
    items: [
      { label: "Products", href: "/inventory/products", icon: "products", permission: "inventory.read" },
      { label: "Stock movements", href: "/inventory/movements", icon: "movements", permission: "inventory.read" },
      { label: "Stock count", href: "/inventory/count", icon: "count", permission: "inventory.write" },
    ],
  },
  {
    section: "Accounting",
    items: [
      { label: "Journal", href: "/accounting/journal", icon: "journal", permission: "accounting.read" },
      { label: "Trial balance", href: "/accounting/trial-balance", icon: "balance", permission: "accounting.read" },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: "users", permission: "admin.users" },
      { label: "Audit log", href: "/admin/audit", icon: "audit", permission: "admin.system" },
      { label: "System status", href: "/admin/system", icon: "system", permission: "admin.system" },
    ],
  },
];
