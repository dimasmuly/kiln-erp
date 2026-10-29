"use client";

import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  ClipboardCheck,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Scale,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import type { NavIcon, NavItem } from "./nav-items";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  invoices: FileText,
  customers: Users,
  purchase: Truck,
  suppliers: Factory,
  products: Package,
  movements: ArrowLeftRight,
  count: ClipboardCheck,
  journal: BookOpen,
  balance: Scale,
  users: UserCog,
  audit: History,
  system: Activity,
};

export function SidebarNav({ sections }: { sections: { section: string; items: NavItem[] }[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-5" aria-label="Main">
      {sections.map((group) => (
        <div key={group.section}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{group.section}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                      active ? "bg-sidebar-active text-white" : "text-sidebar-text hover:bg-sidebar-active/70 hover:text-white",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-accent" : "text-sidebar-muted group-hover:text-sidebar-text")} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
