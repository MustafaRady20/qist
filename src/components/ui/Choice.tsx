import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

// Figma: Components / Actions & Fields → Checkbox (7:290), Radio (7:298),
// Toggle (7:306). 44px touch target, bg → accentBg when on, muted when disabled.

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

const rowClass = cn(
  "text-label relative inline-flex h-11 cursor-pointer items-center gap-2 rounded-control bg-bg px-4 text-text transition-colors select-none",
  "has-checked:bg-accentBg",
  "has-disabled:cursor-not-allowed has-disabled:bg-bg has-disabled:text-muted",
  "has-focus-visible:ring-2 has-focus-visible:ring-info has-focus-visible:ring-inset",
);

const inputClass = "peer absolute inset-0 cursor-[inherit] opacity-0";

export function Checkbox({ label, className, ...rest }: ChoiceProps) {
  return (
    <label className={cn(rowClass, className)}>
      <input type="checkbox" className={inputClass} {...rest} />
      <span className="grid size-4 place-items-center rounded-[4px] border-[1.5px] border-current peer-checked:border-navy peer-checked:bg-navy peer-checked:text-surface [&>svg]:invisible peer-checked:[&>svg]:visible">
        <Icon name="check" size={12} />
      </span>
      {label}
    </label>
  );
}

export function Radio({ label, className, ...rest }: ChoiceProps) {
  return (
    <label className={cn(rowClass, className)}>
      <input type="radio" className={inputClass} {...rest} />
      <span className="grid size-4 place-items-center rounded-full border-[1.5px] border-current peer-checked:border-navy after:size-2 after:rounded-full after:bg-navy after:opacity-0 peer-checked:after:opacity-100" />
      {label}
    </label>
  );
}

export function Toggle({ label, className, ...rest }: ChoiceProps) {
  return (
    <label className={cn(rowClass, className)}>
      <input type="checkbox" role="switch" className={inputClass} {...rest} />
      <span className="relative h-4 w-7 rounded-full bg-border transition-colors peer-checked:bg-navy peer-disabled:opacity-60 after:absolute after:top-0.5 after:start-0.5 after:size-3 after:rounded-full after:bg-surface after:transition-[inset-inline-start] peer-checked:after:start-3.5" />
      {label}
    </label>
  );
}
