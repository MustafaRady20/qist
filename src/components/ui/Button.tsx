import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

// Figma: Components / Actions & Fields → Button/* (7:18 … 7:102).
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "whatsapp"
  | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-navy text-surface hover:bg-navyHover",
  secondary: "bg-accentBg text-text hover:bg-bg",
  outline: "border border-border bg-surface text-text hover:bg-bg",
  ghost: "bg-transparent text-text",
  danger: "bg-danger text-surface hover:bg-dangerText",
  whatsapp: "bg-accentBg text-successText",
  icon: "bg-surface text-text hover:bg-bg",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  { disabled = false, className }: { disabled?: boolean; className?: string } = {},
) {
  return cn(
    "text-button inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-control px-4 whitespace-nowrap transition-colors",
    "outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-inset",
    "active:opacity-84",
    variant === "icon" && "w-12 px-0",
    disabled
      ? cn("text-muted", variant === "ghost" ? "bg-transparent" : "bg-bg")
      : variantClasses[variant],
    // Outline keeps its border when disabled.
    disabled && variant === "outline" && "border border-border",
    disabled && "cursor-not-allowed active:opacity-100",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Label shown while loading; defaults to the regular children. */
  loadingText?: ReactNode;
  /** Rendered at the start (right, in RTL) of the label. */
  startIcon?: ReactNode;
  /** Rendered at the end (left, in RTL) of the label. */
  endIcon?: ReactNode;
};

export function Button({
  variant = "primary",
  loading = false,
  loadingText,
  startIcon,
  endIcon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, {
        disabled,
        className: cn(loading && "cursor-progress active:opacity-100", className),
      })}
      {...rest}
    >
      {loading ? (
        <>
          {loadingText ?? children}
          <Spinner />
        </>
      ) : (
        <>
          {startIcon}
          {children}
          {endIcon}
        </>
      )}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};

/** A navigation action styled as a button (Figma "Go/…" instances). */
export function ButtonLink({
  variant = "primary",
  startIcon,
  endIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, { className })} {...rest}>
      {startIcon}
      {children}
      {endIcon}
    </Link>
  );
}
