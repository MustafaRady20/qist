import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { Forbidden } from "@/components/page/Forbidden";
import { KpiCard } from "@/components/page/KpiCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Panel } from "@/components/page/Panel";
import { RangeForm } from "@/components/page/RangeForm";
import { pickTab, SegmentedTabs } from "@/components/page/SegmentedTabs";
import { buttonClasses } from "@/components/ui";
import { formatAmount, formatDate, formatPercent } from "@/lib/format";
import { queryString } from "@/lib/url";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import {
  getReport,
  isReportSlug,
  type ReportCell,
  type ReportColumn,
  type ReportKpi,
  type ReportPreset,
  type ReportRow,
} from "@/server/reports/service";

export const metadata: Metadata = { title: "التقارير · قسط" };

const presets: { value: ReportPreset; label: string }[] = [
  { value: "year", label: "هذه السنة" },
  { value: "quarter", label: "هذا الربع" },
  { value: "month", label: "هذا الشهر" },
  { value: "custom", label: "فترة مخصصة" },
];

/** Rows rendered on screen; the export always carries the whole table. */
const SCREEN_ROWS = 100;

const monthName = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
const countFormat = new Intl.NumberFormat("en-US");

function renderCell(value: ReportCell, kind: ReportColumn["kind"]) {
  if (value === null || value === "") return "—";
  switch (kind) {
    case "money":
      return formatAmount(Number(value));
    case "count":
      return countFormat.format(Number(value));
    case "percent":
      return formatPercent(Number(value));
    case "date":
      return formatDate(String(value));
    case "month":
      return monthName.format(new Date(`${value}-01T00:00:00Z`));
    case "contract":
      return (
        <Link href={`/contracts/${value}`} className="num underline-offset-4 hover:underline">
          {value}
        </Link>
      );
    default:
      return <span className="line-clamp-2 max-w-64">{value}</span>;
  }
}

function kpiValue(k: ReportKpi) {
  if (k.value === null) return "—";
  if (k.kind === "money") return formatAmount(k.value, { whole: true });
  return k.kind === "percent" ? formatPercent(k.value) : countFormat.format(k.value);
}

function kpiNote(k: ReportKpi) {
  // Nothing to compare against when the previous period was empty.
  if (k.change === undefined || k.change === null) return undefined;
  if (k.change === 0) return "بدون تغيير عن الفترة السابقة";
  return `${k.change > 0 ? "↑" : "↓"} ${formatPercent(Math.abs(k.change))} عن الفترة السابقة`;
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[slug]">) {
  const user = await requirePageUser();
  if (!can(user.role, "reports:read")) return <Forbidden />;
  const { slug } = await params;
  if (!isReportSlug(slug)) notFound();

  const sp = await searchParams;
  const period = pickTab(presets, sp.period);
  const report = await getReport(slug, { period, from: sp.from, to: sp.to });
  const { range } = report;
  const custom = period === "custom" && range ? { from: range.from, to: range.to } : {};

  const columns: Column<ReportRow>[] = report.columns.map((c) => ({
    key: c.key,
    header: c.header,
    numeric: c.kind === "money" || c.kind === "count" || c.kind === "percent",
    cell: (r) => renderCell(r[c.key], c.kind),
  }));
  const rows = report.rows.slice(0, SCREEN_ROWS).map((r, i) => ({ ...r, __row: i }));

  return (
    <>
      <PageHeader
        title={report.title}
        description={
          <>
            {report.description}{" "}
            {range ? (
              <>
                • {formatDate(range.from)} – {formatDate(range.to)}
              </>
            ) : (
              <>• حتى {formatDate(report.asOf)}</>
            )}
          </>
        }
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "التقارير", href: "/reports" }, { label: report.title }]}
        action={
          <a
            href={`/api/v1/reports/${slug}${queryString({ period, ...custom, format: "csv" })}`}
            download
            className={buttonClasses("outline", { className: "max-lg:w-full lg:w-40" })}
          >
            تصدير CSV ↓
          </a>
        }
      />
      {report.ranged && range && (
        <>
          <SegmentedTabs items={presets} value={period} param="period" label="الفترة الزمنية" />
          {period === "custom" && <RangeForm range={range} keep={{ period }} />}
        </>
      )}
      <KpiGrid>
        {report.kpis.map((k, i) => (
          <KpiCard key={k.label} label={k.label} value={kpiValue(k)} note={kpiNote(k)} highlight={i === 0} />
        ))}
      </KpiGrid>
      <Panel
        title={
          <>
            {report.title} • <span className="num">{countFormat.format(report.rows.length)}</span>{" "}
            {report.rows.length >= 3 && report.rows.length <= 10 ? "صفوف" : "صف"}
          </>
        }
      >
        {rows.length ? (
          <DataTable caption={report.title} columns={columns} rows={rows} rowKey={(r) => String(r.__row)} />
        ) : (
          <EmptyState icon="reports" title="لا توجد بيانات">
            {report.ranged ? "لا توجد حركات في هذه الفترة. جرّب فترة أخرى." : "لا توجد سجلات لهذا التقرير حتى اليوم."}
          </EmptyState>
        )}
        {report.rows.length > rows.length && (
          <p className="text-caption text-secondary">
            يُعرض أول <span className="num">{rows.length}</span> صف. صدّر التقرير للحصول على الجدول كاملًا.
          </p>
        )}
      </Panel>
      {report.byDueDate && <Notice>التحصيل محسوب حسب شهر استحقاق القسط: المحصّل في شهر هو ما سُدّد من الأقساط المستحقة فيه.</Notice>}
      {report.note && <Notice>{report.note}</Notice>}
      {report.truncated && <Notice tone="warning">النتيجة أكبر من الحد الأقصى للصفوف. قلّص الفترة للحصول على كل الحركات.</Notice>}
    </>
  );
}
