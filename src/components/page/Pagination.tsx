import Link from "next/link";
import { cn } from "@/lib/cn";

/** Figma: Pagination — result count at the start, السابق / page / التالي at the end. */
export function Pagination({
  total,
  page = 1,
  pageCount = 1,
  hrefFor,
}: {
  total: number;
  page?: number;
  pageCount?: number;
  hrefFor?: (page: number) => string;
}) {
  const link = (target: number, label: string) => {
    const disabled = !hrefFor || target < 1 || target > pageCount;
    return disabled ? (
      <span aria-disabled className="text-muted">
        {label}
      </span>
    ) : (
      <Link href={hrefFor(target)} className="hover:text-text">
        {label}
      </Link>
    );
  };

  return (
    <nav aria-label="التنقل بين الصفحات" className="flex items-center justify-between gap-4">
      <p className="text-caption text-secondary">
        عرض <span className="num">{total}</span> {total === 1 ? "نتيجة" : "نتائج"}
      </p>
      <div className={cn("text-body flex items-center gap-4 text-secondary")}>
        {link(page - 1, "السابق")}
        <span aria-current="page" className="num text-text">
          {page}
        </span>
        {link(page + 1, "التالي")}
      </div>
    </nav>
  );
}
