/**
 * Typed references to Qist tokens for use in TS (inline styles, charts, etc.).
 * Values are CSS variables so tokens.css stays the single source of truth.
 */
export const colorTokens = [
  "navy",
  "navyHover",
  "accent",
  "accentHover",
  "bg",
  "surface",
  "text",
  "secondary",
  "muted",
  "border",
  "success",
  "warning",
  "danger",
  "info",
  "whatsapp",
  "successBg",
  "warningBg",
  "dangerBg",
  "infoBg",
  "accentBg",
  "successText",
  "warningText",
  "dangerText",
  "infoText",
  "navSelected",
] as const;

export type ColorToken = (typeof colorTokens)[number];

export const colorVar = (token: ColorToken) => `var(--qist-color-${token})`;

export const spacing = {
  0: "var(--qist-spacing-0)",
  8: "var(--qist-spacing-8)",
  16: "var(--qist-spacing-16)",
  24: "var(--qist-spacing-24)",
  32: "var(--qist-spacing-32)",
  48: "var(--qist-spacing-48)",
  64: "var(--qist-spacing-64)",
} as const;

export const radius = {
  0: "var(--qist-radius-0)",
  8: "var(--qist-radius-8)",
  12: "var(--qist-radius-12)",
  16: "var(--qist-radius-16)",
} as const;
