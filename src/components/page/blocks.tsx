import type { ReactNode } from "react";
import { Button, Icon, TextField, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Row of secondary page actions (Figma "Actions", 160px buttons, gap 12). */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-40", className)}>{children}</div>;
}

/** Figma "KPIs": up to four KPI cards, 16px gap. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">{children}</div>;
}

/** White explainer card: 18/500 title + 14 secondary body. */
export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6">
      <h2 className="text-h4 text-text">{title}</h2>
      <p className="text-body text-secondary">{children}</p>
    </section>
  );
}

const noticeTones = {
  info: "bg-infoBg text-infoText",
  success: "bg-successBg text-successText",
  warning: "bg-warningBg text-warningText",
  danger: "bg-dangerBg text-dangerText",
};

/** Figma "Notice": tinted banner (info by default), 14px text. */
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: keyof typeof noticeTones }) {
  return (
    <p role={tone === "danger" ? "alert" : "note"} className={cn("text-body rounded-control p-4", noticeTones[tone])}>
      {children}
    </p>
  );
}

/** Label / value rows inside a panel (Figma "customer-profile" detail cards). */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-body shrink-0 text-secondary">{item.label}</dt>
          <dd className="text-num-sm min-w-0 text-end break-words text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Figma empty-state patterns ("empty-customers", "no-results"): icon, title, hint and one action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4 py-6">
      <Icon name={icon} className="text-secondary" />
      <h3 className="text-h2 text-navy">{title}</h3>
      <p className="text-body text-secondary">{children}</p>
      {action}
    </div>
  );
}

/**
 * Figma "Filter bar": search field (submits `q` via GET, keeping other params)
 * plus filter / save view / columns / export actions.
 */
export function FilterBar({
  placeholder,
  q,
  keep = {},
}: {
  placeholder: string;
  q?: string;
  /** Other query params to preserve when searching (e.g. the active tab). */
  keep?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <form role="search" className="lg:flex-1">
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <TextField kind="search" name="q" label="بحث" placeholder={placeholder} defaultValue={q} />
      </form>
      <div className="grid grid-cols-2 gap-3 sm:flex [&>*]:max-sm:w-full">
        <Button variant="outline" className="w-32" endIcon={<Icon name="chevronDown" size={16} />}>
          تصفية
        </Button>
        <Button variant="ghost" className="w-28">
          حفظ العرض
        </Button>
        <Button variant="outline" className="w-28">
          الأعمدة
        </Button>
        <Button variant="outline" className="w-28">
          تصدير ↓
        </Button>
      </div>
    </div>
  );
}
