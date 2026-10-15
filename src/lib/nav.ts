import type { IconName } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: IconName };
export type NavGroup = { label: string; items: NavItem[] };

// Figma: Pattern/Sidebar (10:25).
export const navGroups: NavGroup[] = [
  {
    label: "اليومي",
    items: [
      { href: "/", label: "لوحة التحكم", icon: "dashboard" },
      { href: "/customers", label: "العملاء", icon: "customers" },
      { href: "/contracts", label: "العقود", icon: "contracts" },
    ],
  },
  {
    label: "العمليات المالية",
    items: [
      { href: "/installments", label: "الأقساط", icon: "calendar" },
      { href: "/payments", label: "المدفوعات", icon: "wallet" },
      { href: "/statements", label: "كشف الحساب", icon: "statement" },
      { href: "/collections", label: "متابعة السداد", icon: "collections" },
      { href: "/overdue", label: "المتأخرات", icon: "alert" },
      { href: "/whatsapp", label: "واتساب", icon: "chat" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { href: "/reports", label: "التقارير", icon: "reports" },
      { href: "/audit", label: "سجل التدقيق", icon: "history" },
      { href: "/settings", label: "الإعدادات", icon: "settings" },
    ],
  },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
