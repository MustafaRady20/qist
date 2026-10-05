import Link from "next/link";
import type { ReactNode } from "react";

type Crumb = { label: string; href?: string };

/** Figma: Breadcrumb + Page heading (title 28/700 navy, description 14 secondary, primary action). */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
}: {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      {breadcrumbs && (
        <nav aria-label="مسار التنقل" className="text-caption hidden text-secondary lg:block">
          <ol className="flex gap-2">
            {breadcrumbs.map((c, i) => (
              <li key={c.label} className="flex gap-2">
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-text">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 text-navy lg:text-h1">{title}</h1>
          {description && <p className="text-caption text-secondary lg:text-body">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
