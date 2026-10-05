import type { Metadata } from "next";
import { FilterBar, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { Forbidden } from "@/components/page/Forbidden";
import { PageHeader } from "@/components/page/PageHeader";
import { Pagination } from "@/components/page/Pagination";
import { Panel } from "@/components/page/Panel";
import { pickQuery } from "@/components/page/SegmentedTabs";
import { formatDayMonth } from "@/lib/format";
import { queryString } from "@/lib/url";
import { listAuditLog, type AuditListItem } from "@/server/audit-log/service";
import { requirePageUser } from "@/server/auth/dal";
import { can } from "@/server/auth/permissions";
import { pageSchema } from "@/server/validation";

export const metadata: Metadata = { title: "سجل التدقيق · قسط" };

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });

/** Compact rendering of a before/after payload for the table. */
function summarize(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "—";
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" • ");
}

function device(ua: string | null, ip: string | null) {
  const browser = ua?.match(/(Edg|Chrome|Firefox|Safari)\//)?.[1]?.replace("Edg", "Edge");
  return [browser, ip].filter(Boolean).join(" / ") || "غير متاح";
}

const columns: Column<AuditListItem>[] = [
  { key: "actor", header: "مَن", cell: (r) => r.actorName ?? "النظام" },
  { key: "action", header: "الإجراء", cell: (r) => r.action },
  { key: "ref", header: "المرجع", cell: (r) => r.ref ?? "—", numeric: true },
  {
    key: "at",
    header: "متى",
    cell: (r) => (
      <>
        {formatDayMonth(r.createdAt)} <span className="num">{time.format(r.createdAt)}</span>
      </>
    ),
  },
  { key: "before", header: "قديم", cell: (r) => <span className="line-clamp-2 max-w-48">{summarize(r.before)}</span> },
  { key: "after", header: "جديد", cell: (r) => <span className="line-clamp-2 max-w-48">{summarize(r.after)}</span> },
  { key: "device", header: "الجهاز / IP", cell: (r) => <span className="num">{device(r.userAgent, r.ip)}</span> },
];

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const user = await requirePageUser();
  if (!can(user.role, "audit:read")) return <Forbidden />;
  const sp = await searchParams;
  const q = pickQuery(sp.q);
  const list = await listAuditLog({ q, page: pageSchema.parse(sp.page) });

  return (
    <>
      <PageHeader
        title="سجل التدقيق"
        description="أثر دائم لكل إجراء حساس • عرض فقط"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "سجل التدقيق" }]}
      />
      <FilterBar placeholder="نوع الإجراء / المرجع / المستخدم" q={q} />
      <Panel title="التغييرات">
        {list.items.length ? (
          <DataTable caption="التغييرات" columns={columns} rows={list.items} rowKey={(r) => String(r.id)} />
        ) : (
          <p className="text-body py-8 text-center text-secondary">لا توجد سجلات مطابقة.</p>
        )}
        <Pagination total={list.total} page={list.page} pageCount={list.pageCount} hrefFor={(p) => queryString({ q, page: p })} />
      </Panel>
      <Notice>
        يُسجل أيضًا عكس المدفوعات، حظر العملاء، تعديل العقود، وتغيير السياسات. لا يوجد حذف دائم للسجلات المالية.
      </Notice>
    </>
  );
}
