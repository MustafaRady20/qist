import { ltr } from "@/lib/format";
import { matches } from "@/lib/search";

/** Demo data mirroring Figma "collections" (16:2) and "overdue" (16:233). Money in piastres. */

export type FollowUpTab = "today" | "overdue" | "upcoming" | "broken" | "noContact" | "contacted";

export const followUpTabs: { value: FollowUpTab; label: string }[] = [
  { value: "today", label: "متابعة اليوم" },
  { value: "overdue", label: "متأخرون" },
  { value: "upcoming", label: "وعود قادمة" },
  { value: "broken", label: "وعد فات" },
  { value: "noContact", label: "بدون تواصل" },
  { value: "contacted", label: "تم التواصل" },
];

export type FollowUpCard = {
  customer: string;
  phone: string;
  contract: string;
  remaining: number;
  daysLate: number;
  lastPayment: string;
  lastContact: string;
  promiseDate?: string;
  /** Free text such as "اليوم 14:30". */
  nextFollowUp: string;
  tabs: FollowUpTab[];
};

const EGP = 100;

const followUps: FollowUpCard[] = [
  { customer: "منى خالد إبراهيم", phone: "01123456789", contract: "CT-1018", remaining: 950 * EGP, daysLate: 7, lastPayment: "2026-08-01", lastContact: "2026-09-25", promiseDate: "2026-09-30", nextFollowUp: "اليوم 14:30", tabs: ["today", "overdue", "upcoming"] },
  { customer: "كريم حسن محمود", phone: "01234567890", contract: "CT-1016", remaining: 4_000 * EGP, daysLate: 26, lastPayment: "2026-08-01", lastContact: "2026-09-25", promiseDate: "2026-09-30", nextFollowUp: "اليوم 14:30", tabs: ["today", "overdue", "broken"] },
];

export async function getFollowUpSummary() {
  return {
    today: { count: 2, note: "كريم ومنى" },
    total: { amount: 4_950 * EGP, note: "من العميلين الظاهرين" },
    promises: { count: 2, note: "الموعد المتفق عليه 30 سبتمبر" },
  };
}

export async function listFollowUps({ tab, q }: { tab: FollowUpTab; q?: string }) {
  return followUps.filter((f) => f.tabs.includes(tab) && matches(q, f.customer, f.phone));
}

export type AgingTab = "all" | "1-7" | "8-30" | "31-60" | "61-90" | "90+";

export const agingTabs: { value: AgingTab; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "1-7", label: `${ltr("1–7")} أيام` },
  { value: "8-30", label: ltr("8–30") },
  { value: "31-60", label: ltr("31–60") },
  { value: "61-90", label: ltr("61–90") },
  { value: "90+", label: ltr("90+") },
];

export type OverdueRow = {
  customer: string;
  overdue: number;
  daysLate: number;
  lastContact: string;
  /** Promise to pay: a date, or a state label. */
  promise: { date: string } | { label: "مكسور" | "بدون وعد" };
  nextFollowUp: string;
};

const overdueRows: OverdueRow[] = [
  { customer: "كريم حسن", overdue: 4_000 * EGP, daysLate: 26, lastContact: "2026-09-25", promise: { label: "مكسور" }, nextFollowUp: "اليوم 14:30" },
  { customer: "منى خالد", overdue: 950 * EGP, daysLate: 7, lastContact: "2026-09-26", promise: { date: "2026-09-30" }, nextFollowUp: "30 سبتمبر" },
  { customer: "هبة عادل", overdue: 6_000 * EGP, daysLate: 92, lastContact: "2026-09-20", promise: { label: "بدون وعد" }, nextFollowUp: "اليوم 16:00" },
];

const bands: Record<Exclude<AgingTab, "all">, [number, number]> = {
  "1-7": [1, 7],
  "8-30": [8, 30],
  "31-60": [31, 60],
  "61-90": [61, 90],
  "90+": [91, Infinity],
};

export async function getOverdueSummary() {
  return { customers: 47, total: 186_750 * EGP };
}

/** Rows come in follow-up priority order, as ranked by the collections team. */
export async function listOverdue({ tab }: { tab: AgingTab }) {
  return overdueRows.filter(
    (r) => tab === "all" || (r.daysLate >= bands[tab][0] && r.daysLate <= bands[tab][1]),
  );
}
