import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** White card with a 18/500 title — Figma chart & table cards (r16, p24, gap16). */
export function Panel({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-panel border border-border bg-surface p-6",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-4">
          {title && <h2 className="text-h4 text-text">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
