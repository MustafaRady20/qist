"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isActive, navGroups } from "@/lib/nav";

/**
 * Nav list shared by the full sidebar, the 80px icon rail (1024–1279) and the
 * mobile drawer. `rail` hides labels between lg and xl.
 */
export function SidebarNav({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="القائمة الرئيسية" className="flex flex-col gap-1">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className={cn("text-caption pt-4 pb-1 text-muted", rail && "lg:max-xl:sr-only")}>
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={rail ? item.label : undefined}
                className={cn(
                  "text-body flex h-11 items-center gap-3 rounded-control px-3 transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-inset",
                  active ? "bg-accentBg text-navy" : "text-secondary hover:bg-bg",
                  rail && "lg:max-xl:justify-center lg:max-xl:px-0",
                )}
              >
                <Icon name={item.icon} className={active ? "text-accent" : undefined} />
                <span className={cn(rail && "lg:max-xl:sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
