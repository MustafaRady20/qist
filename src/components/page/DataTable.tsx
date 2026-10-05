import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Numbers, amounts and references render LTR with tabular figures. */
  numeric?: boolean;
  className?: string;
};

/**
 * Figma: Data table — header row bg #f5f7f6 (r8, 13/500 secondary), 48px rows
 * split by 1px dividers. Below `md` rows render with `mobileCard` when given
 * (Foundations: "390: tables as cards").
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  mobileCard,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  mobileCard?: (row: T) => ReactNode;
}) {
  return (
    <>
      <div className={cn("overflow-x-auto", mobileCard && "max-md:hidden")}>
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-right">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "text-label bg-bg px-2 py-3 font-medium text-secondary",
                    i === 0 && "rounded-s-control",
                    i === columns.length - 1 && "rounded-e-control",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "text-body h-20 border-b border-border px-2 py-2",
                      i === 0 ? "text-navy" : "text-text",
                      c.className,
                    )}
                  >
                    {c.numeric ? <span className="num">{c.cell(row)}</span> : c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobileCard && (
        <ul className="flex flex-col gap-6 md:hidden">
          {rows.map((row) => (
            <li key={rowKey(row)}>{mobileCard(row)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
