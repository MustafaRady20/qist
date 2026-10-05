import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Figma: Tabs — equal-width 48px items, selected on accentBg. Selection lives
 * in the URL (`?param=value`) so it survives reloads and can be shared.
 */
export function SegmentedTabs<V extends string>({
  items,
  value,
  param,
  label,
  keep = {},
}: {
  items: { value: V; label: string }[];
  value: V;
  param: string;
  label: string;
  /** Other query params to preserve when switching tabs (e.g. the search). */
  keep?: Record<string, string | undefined>;
}) {
  const href = (v: V) => {
    const params = new URLSearchParams();
    for (const [k, val] of Object.entries(keep)) if (val) params.set(k, val);
    params.set(param, v);
    return `?${params}`;
  };

  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 md:flex-nowrap md:overflow-x-auto">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Link
            key={item.value}
            href={href(item.value)}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "text-button flex h-12 min-w-28 flex-1 items-center justify-center rounded-control px-4 whitespace-nowrap transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-inset",
              selected ? "bg-accentBg text-text" : "text-text hover:bg-bg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Reads a tab value from search params, falling back to the first item. */
export function pickTab<V extends string>(items: { value: V }[], raw: string | string[] | undefined): V {
  const v = typeof raw === "string" ? raw : undefined;
  return items.find((i) => i.value === v)?.value ?? items[0].value;
}

export function pickQuery(raw: string | string[] | undefined): string | undefined {
  const v = typeof raw === "string" ? raw.trim() : undefined;
  return v || undefined;
}
