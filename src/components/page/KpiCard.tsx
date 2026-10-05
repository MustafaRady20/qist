import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Figma: Pattern/KPI card — r16, p16, gap8; `highlight` is the navy variant. */
export function KpiCard({
  label,
  value,
  note,
  highlight = false,
}: {
  label: ReactNode;
  value: string;
  note?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-panel p-4 shadow-card",
        highlight ? "bg-navy text-surface" : "border border-border bg-surface",
      )}
    >
      <p className={cn("text-h4", highlight ? "text-surface" : "text-text")}>{label}</p>
      <p className={cn("text-num-lg num text-right", highlight ? "text-surface" : "text-navy")}>
        {value}
      </p>
      {note && (
        <p className={cn("text-caption", highlight ? "text-accentBg" : "text-successText")}>{note}</p>
      )}
    </div>
  );
}
