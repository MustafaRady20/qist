import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Figma: Brand/Qist lockup (mark 32px + wordmark 28/700 navy, 12px gap).
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      aria-label="قسط — لوحة التحكم"
      className={cn("inline-flex h-10 items-center gap-3 rounded-control", className)}
    >
      <Image src="/brand/qist-mark.svg" alt="" width={32} height={32} priority />
      {!compact && <span className="text-[28px] leading-10 font-bold text-navy">قسط</span>}
    </Link>
  );
}
