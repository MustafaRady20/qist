import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Figma: Components / Actions & Fields → Badge (7:282).

export type BadgeTone = "success" | "warning" | "info" | "danger";

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-successBg text-successText",
  warning: "bg-warningBg text-warningText",
  info: "bg-infoBg text-infoText",
  danger: "bg-dangerBg text-dangerText",
};

export const statuses = {
  active: { label: "نشط", tone: "success" },
  paid: { label: "مدفوع", tone: "success" },
  partial: { label: "مدفوع جزئيًا", tone: "warning" },
  waived: { label: "أُغلق بالتسوية", tone: "info" },
  due: { label: "مستحق اليوم", tone: "warning" },
  upcoming: { label: "قادم", tone: "info" },
  overdue: { label: "متأخر", tone: "danger" },
  draft: { label: "مسودة", tone: "info" },
  completed: { label: "مكتمل", tone: "success" },
  settled: { label: "تسوية مبكرة", tone: "success" },
  consolidated: { label: "ضمن مجموعة", tone: "info" },
  cancelled: { label: "ملغي", tone: "danger" },
  blocked: { label: "محظور", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

export type Status = keyof typeof statuses;

type BadgeProps = { className?: string } & (
  | { status: Status; tone?: never; children?: ReactNode }
  | { status?: never; tone: BadgeTone; children: ReactNode }
);

export function Badge({ status, tone, children, className }: BadgeProps) {
  const resolvedTone = status ? statuses[status].tone : tone;
  return (
    <span
      className={cn(
        "text-label inline-flex h-8 items-center justify-center gap-2 rounded-control px-3 whitespace-nowrap",
        toneClasses[resolvedTone!],
        className,
      )}
    >
      {children ?? (status && statuses[status].label)}
    </span>
  );
}
