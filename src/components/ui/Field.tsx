"use client";

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { Icon } from "./Icon";

// Figma: Components / Actions & Fields → Field/* (7:116 … 7:256).
// Shell: 80px tall, 12/16 padding, 4px gap, 13/500 label, 14/400 value.

type ShellProps = {
  id: string;
  label: ReactNode;
  error?: string | boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

function FieldShell({ id, label, error, disabled, className, children }: ShellProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "relative flex min-h-20 flex-col justify-center gap-1 rounded-control border px-4 py-3 transition-colors",
          disabled
            ? "border-border bg-bg text-muted"
            : error
              ? "border-danger bg-surface text-text"
              : "border-border bg-surface text-text focus-within:border-info",
        )}
      >
        <label htmlFor={id} className="text-label text-secondary">
          {label}
        </label>
        {children}
      </div>
      {typeof error === "string" && error && (
        <p
          id={`${id}-error`}
          className="text-caption flex items-center gap-1 text-dangerText"
        >
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

const controlClass =
  "text-body w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-muted disabled:cursor-not-allowed";

function a11y(id: string, error?: string | boolean) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": typeof error === "string" && error ? `${id}-error` : undefined,
  } as const;
}

type BaseProps = {
  label: ReactNode;
  error?: string | boolean;
  className?: string;
};

export type TextFieldKind = "text" | "phone" | "currency" | "percentage" | "search" | "email" | "password";

type TextFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
    kind?: TextFieldKind;
  };

const kindInputProps: Record<TextFieldKind, InputHTMLAttributes<HTMLInputElement>> = {
  text: { type: "text" },
  search: { type: "search" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel" },
  currency: { type: "text", inputMode: "decimal" },
  percentage: { type: "text", inputMode: "decimal" },
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  password: { type: "password" },
};

export function TextField({
  label,
  error,
  className,
  kind = "text",
  id: idProp,
  disabled,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  // Phone numbers, amounts and emails are LTR, right-aligned, never reordered.
  const numeric = kind === "phone" || kind === "currency" || kind === "percentage";
  const ltr = numeric || kind === "email";

  const input = (
    <input
      {...kindInputProps[kind]}
      {...a11y(id, error)}
      disabled={disabled}
      dir={ltr ? "ltr" : undefined}
      className={cn(controlClass, ltr && "text-right", numeric && "num")}
      {...rest}
    />
  );

  return (
    <FieldShell id={id} label={label} error={error} disabled={disabled} className={className}>
      {kind === "percentage" ? (
        <div dir="ltr" className="text-body flex items-center">
          {input}
          <span aria-hidden>%</span>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

type TextareaFieldProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function TextareaField({
  label,
  error,
  className,
  id: idProp,
  disabled,
  rows = 1,
  ...rest
}: TextareaFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} disabled={disabled} className={className}>
      <textarea
        {...a11y(id, error)}
        rows={rows}
        disabled={disabled}
        className={cn(controlClass, "field-sizing-content min-h-6 resize-none")}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectFieldProps = BaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
    placeholder?: string;
  };

export function SelectField({
  label,
  error,
  className,
  id: idProp,
  disabled,
  placeholder,
  children,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} disabled={disabled} className={className}>
      <div className="relative flex items-center">
        <select
          {...a11y(id, error)}
          disabled={disabled}
          className={cn(controlClass, "cursor-pointer appearance-none pe-6")}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <Icon
          name="chevronDown"
          size={16}
          className="pointer-events-none absolute end-0 text-secondary"
        />
      </div>
    </FieldShell>
  );
}

type DateFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "value" | "defaultValue"> & {
    /** ISO date (YYYY-MM-DD). */
    value?: string;
    defaultValue?: string;
    placeholder?: string;
  };

/**
 * Shows the date as DD MMM YYYY ("01 أكتوبر 2026") and opens the native
 * picker on click, so the display format stays consistent across browsers.
 */
export function DateField({
  label,
  error,
  className,
  id: idProp,
  disabled,
  value,
  defaultValue,
  onChange,
  placeholder = "اختر التاريخ",
  ...rest
}: DateFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;

  return (
    <FieldShell id={id} label={label} error={error} disabled={disabled} className={className}>
      <div className="relative">
        <span className={cn("text-body block", !current && "text-muted")}>
          {current ? formatDate(current) : placeholder}
        </span>
        <input
          type="date"
          {...a11y(id, error)}
          disabled={disabled}
          value={current}
          onChange={(e) => {
            setInner(e.target.value);
            onChange?.(e);
          }}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              // Older browsers: the native control handles it.
            }
          }}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
      </div>
    </FieldShell>
  );
}
