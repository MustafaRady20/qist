import { cn } from "@/lib/cn";

// Figma "Loading indicator": 16px ring, 2px stroke in the label color.
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
