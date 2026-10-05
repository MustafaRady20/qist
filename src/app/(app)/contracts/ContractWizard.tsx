"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DetailList, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { Panel } from "@/components/page/Panel";
import { Badge, Button, ButtonLink, DateField, Icon, SelectField, TextField, TextareaField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { activeContractsLabel, formatAmount, formatDate, formatPercent, installmentsCountLabel, parseAmount } from "@/lib/format";
import type { ContractInput } from "@/server/contracts/service";
import { addMonths, buildFlatSchedule, type Schedule, type ScheduleRow } from "@/server/finance/schedule";
import { saveContractAction, searchCustomersAction, type CustomerOption } from "./actions";

export type RuleOption = {
  id: string;
  name: string;
  version: number;
  annualRateBp: number;
  minTermMonths: number;
  maxTermMonths: number;
  minDownPaymentBp: number;
};

export type WizardDraft = {
  code: string;
  productDescription: string;
  quantity: number;
  supplier: string | null;
  purchaseCost: number;
  downPayment: number;
  financeRuleId: string;
  termMonths: number;
  fees: number;
  firstDueDate: string;
};

const steps = ["العميل", "بيانات الشراء", "المقدم", "خطة التقسيط", "جدول الأقساط", "المراجعة"];

/** The wizard step that owns each server-side field, to send the user back to the right place. */
const fieldStep: Record<string, number> = {
  customerId: 1,
  productDescription: 2,
  quantity: 2,
  supplier: 2,
  purchaseCost: 2,
  downPayment: 3,
  financeRuleId: 4,
  termMonths: 4,
  fees: 4,
  firstDueDate: 4,
};

const money = (p: number) => formatAmount(p);
const editable = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

const scheduleColumns: Column<ScheduleRow>[] = [
  { key: "seq", header: "#", cell: (r) => r.seq, numeric: true },
  { key: "due", header: "الاستحقاق", cell: (r) => formatDate(r.dueDate) },
  { key: "opening", header: "أصل افتتاحي", cell: (r) => money(r.openingPrincipal), numeric: true },
  { key: "principal", header: "الأصل", cell: (r) => money(r.principal), numeric: true },
  { key: "profit", header: "العائد", cell: (r) => money(r.profit), numeric: true },
  { key: "fees", header: "الرسوم", cell: (r) => money(r.fees), numeric: true },
  { key: "amount", header: "القسط", cell: (r) => money(r.amount), numeric: true },
  { key: "closing", header: "أصل ختامي", cell: (r) => money(r.closingPrincipal), numeric: true },
  { key: "status", header: "الحالة", cell: () => <Badge status="upcoming" /> },
];

/** Figma "wizard-1" … "wizard-6". The server recomputes and validates the plan on save. */
export function ContractWizard({
  rules,
  today,
  customer: initialCustomer,
  draft,
  canConfirm,
}: {
  rules: RuleOption[];
  /** Today in Cairo (YYYY-MM-DD). */
  today: string;
  customer?: CustomerOption;
  draft?: WizardDraft;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer ?? null);
  const [product, setProduct] = useState(draft?.productDescription ?? "");
  const [quantity, setQuantity] = useState(String(draft?.quantity ?? 1));
  const [cost, setCost] = useState(draft ? editable(draft.purchaseCost) : "");
  const [supplier, setSupplier] = useState(draft?.supplier ?? "");
  const [down, setDown] = useState(draft ? editable(draft.downPayment) : "0");
  const [ruleId, setRuleId] = useState(rules.some((r) => r.id === draft?.financeRuleId) ? draft!.financeRuleId : (rules[0]?.id ?? ""));
  const [months, setMonths] = useState(String(draft?.termMonths ?? 12));
  const [fees, setFees] = useState(draft ? editable(draft.fees) : "0");
  const [firstDue, setFirstDue] = useState(draft && draft.firstDueDate > today ? draft.firstDueDate : addMonths(today, 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const rule = rules.find((r) => r.id === ruleId);
  const costP = parseAmount(cost);
  const downP = parseAmount(down);
  const feesP = parseAmount(fees);
  const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity) : NaN;
  const term = /^\d+$/.test(months.trim()) ? Number(months) : NaN;

  /** Client-side checks for one step; the same rules are enforced again by the server. */
  const check = (n: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (n === 1) {
      if (!customer) e.customerId = "اختر العميل";
      else if (customer.status === "blocked") e.customerId = "العميل محظور ولا يمكن إنشاء عقود جديدة له";
    }
    if (n === 2) {
      if (product.trim().length < 2) e.productDescription = "أدخل المنتج ومواصفاته";
      if (!(qty >= 1 && qty <= 999)) e.quantity = "الكمية من 1 إلى 999";
      if (!costP) e.purchaseCost = "أدخل تكلفة الشراء";
    }
    if (n === 3) {
      if (downP === null) e.downPayment = "أدخل مبلغ المقدم (0 إن لم يوجد)";
      else if (costP && downP >= costP) e.downPayment = "المقدم يجب أن يكون أقل من تكلفة الشراء";
    }
    if (n === 4) {
      if (!rule) e.financeRuleId = "اختر خطة التقسيط";
      else {
        const minDown = Math.ceil(((costP ?? 0) * rule.minDownPaymentBp) / 10_000);
        if ((downP ?? 0) < minDown) {
          e.financeRuleId = `هذه الخطة تتطلب مقدمًا لا يقل عن ${formatPercent(rule.minDownPaymentBp / 100)} (${money(minDown)} جنيه). عدّل المقدم أو اختر خطة أخرى.`;
        }
        if (!(term >= rule.minTermMonths && term <= rule.maxTermMonths)) {
          e.termMonths = `المدة المسموحة ${rule.minTermMonths}–${rule.maxTermMonths} شهرًا`;
        }
      }
      if (feesP === null) e.fees = "أدخل الرسوم (0 إن لم توجد)";
      if (!firstDue || firstDue <= today) e.firstDueDate = "أول استحقاق يجب أن يكون بعد اليوم";
    }
    return e;
  };

  const firstInvalid = (upTo: number) => [1, 2, 3, 4].filter((n) => n <= upTo).find((n) => Object.keys(check(n)).length);
  const planReady = firstInvalid(4) === undefined;

  const schedule: Schedule | null = useMemo(() => {
    if (!rule || !costP || downP === null || feesP === null || !(term >= 1) || downP >= costP) return null;
    try {
      return buildFlatSchedule({ principal: costP - downP, annualRateBp: rule.annualRateBp, termMonths: term, fees: feesP, firstDueDate: firstDue });
    } catch {
      return null;
    }
  }, [rule, costP, downP, feesP, term, firstDue]);

  const goTo = (n: number) => {
    const invalid = firstInvalid(n - 1);
    if (invalid !== undefined) {
      setErrors(check(invalid));
      setStep(invalid);
    } else {
      setErrors({});
      setStep(n);
    }
    window.scrollTo({ top: 0 });
  };

  const save = (confirm: boolean) => {
    const invalid = firstInvalid(4);
    if (invalid !== undefined || !customer || !rule) {
      if (invalid !== undefined) {
        setErrors(check(invalid));
        setStep(invalid);
      }
      return;
    }
    const input: ContractInput = {
      customerId: customer.id,
      productDescription: product,
      quantity: qty,
      supplier,
      purchaseCost: costP!,
      downPayment: downP!,
      financeRuleId: rule.id,
      termMonths: term,
      fees: feesP!,
      firstDueDate: firstDue,
    };
    setServerError(undefined);
    startTransition(async () => {
      const result = await saveContractAction(draft?.code ?? null, input, confirm);
      if (result.ok) {
        router.push(confirm ? `/contracts/${result.code}/created` : `/contracts/${result.code}`);
        return;
      }
      const fields = result.fieldErrors ?? {};
      const target = Object.keys(fields)
        .map((f) => fieldStep[f])
        .filter(Boolean)
        .sort()[0];
      setErrors(fields);
      setServerError(result.error);
      if (target) setStep(target);
      window.scrollTo({ top: 0 });
    });
  };

  const principal = costP !== null && downP !== null ? costP - downP : null;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="خطوات إنشاء العقد" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {steps.map((label, i) => {
          const n = i + 1;
          const current = n === step;
          const done = n < step;
          return (
            <button
              key={label}
              type="button"
              aria-current={current ? "step" : undefined}
              disabled={pending}
              onClick={() => goTo(n)}
              className={cn(
                "text-button flex h-12 cursor-pointer items-center justify-center gap-2 rounded-control px-4 whitespace-nowrap transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-inset",
                current ? "bg-navy text-surface" : done ? "bg-accentBg text-successText" : "text-text hover:bg-bg",
              )}
            >
              {current ? <span aria-hidden className="size-2 rounded-full bg-current" /> : done && <Icon name="check" size={16} />}
              {label}
            </button>
          );
        })}
      </nav>
      <p className="sr-only" aria-live="polite">
        الخطوة {step} من 6 • {steps[step - 1]}
      </p>

      {serverError && <Notice tone="danger">{serverError}</Notice>}

      {step === 1 && <CustomerStep customer={customer} onSelect={setCustomer} error={errors.customerId} />}

      {step === 2 && (
        <>
          <Panel title="بيانات الشراء للعميل">
            <div className="grid gap-4 md:grid-cols-2">
              <TextareaField
                label="المنتج المطلوب ومواصفاته"
                placeholder="Samsung Galaxy • 256 GB • أسود"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                error={errors.productDescription}
                maxLength={300}
                className="md:col-span-2"
              />
              <TextField label="الكمية" kind="currency" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={errors.quantity} />
              <TextField label="تكلفة الشراء (جنيه)" kind="currency" placeholder="60000" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.purchaseCost} />
              <TextField
                label="المورد / مكان الشراء (اختياري)"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                error={errors.supplier}
                maxLength={120}
                className="md:col-span-2"
              />
            </div>
          </Panel>
          <Panel title="ملخص عملية الشراء">
            <DetailList
              items={[
                { label: "تكلفة الشراء", value: <span className="num">{costP ? money(costP) : "—"}</span> },
                { label: "المورد", value: supplier.trim() || "—" },
                { label: "نوع العملية", value: "شراء للعميل ثم بيع بالتقسيط" },
              ]}
            />
          </Panel>
        </>
      )}

      {step === 3 && (
        <>
          <TextField label="الدفعة المقدمة (جنيه)" kind="currency" value={down} onChange={(e) => setDown(e.target.value)} error={errors.downPayment} autoFocus />
          <Panel title="مبلغ التمويل">
            <DetailList
              items={[
                { label: "تكلفة الشراء المعتمدة", value: <span className="num">{costP ? money(costP) : "—"}</span> },
                { label: "المقدم", value: <span className="num">{downP !== null ? money(downP) : "—"}</span> },
                { label: "أصل المبلغ المموّل", value: <span className="num">{principal !== null && principal > 0 ? money(principal) : "—"}</span> },
              ]}
            />
          </Panel>
          <Notice tone="warning">المقدم منفصل عن أقساط التمويل، ويُثبت في العقد عند التأكيد.</Notice>
        </>
      )}

      {step === 4 && (
        <>
          <Panel title="خطة التقسيط">
            {rules.length === 0 ? (
              <Notice tone="danger">لا توجد قاعدة تمويل سارية اليوم. أضف قاعدة من الإعدادات أولًا.</Notice>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField label="خطة التقسيط" value={ruleId} onChange={(e) => setRuleId(e.target.value)} error={errors.financeRuleId}>
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {formatPercent(r.annualRateBp / 100)} سنوي ثابت • الإصدار {r.version}
                    </option>
                  ))}
                </SelectField>
                <TextField label="النسبة السنوية" kind="currency" value={rule ? formatPercent(rule.annualRateBp / 100) : ""} readOnly disabled />
                <TextField label="طريقة الحساب" value="Flat Rate — ثابت" readOnly disabled />
                <TextField
                  label={rule ? `المدة بالأشهر (${rule.minTermMonths}–${rule.maxTermMonths})` : "المدة بالأشهر"}
                  kind="currency"
                  inputMode="numeric"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  error={errors.termMonths}
                />
                <TextField label="عدد الأقساط" kind="currency" value={term >= 1 ? String(term) : ""} readOnly disabled />
                <TextField label="تكرار السداد" value="شهري" readOnly disabled />
                <DateField label="أول استحقاق" value={firstDue} min={today} onChange={(e) => setFirstDue(e.target.value)} error={errors.firstDueDate} />
                <TextField label="رسوم إضافية (جنيه)" kind="currency" value={fees} onChange={(e) => setFees(e.target.value)} error={errors.fees} />
              </div>
            )}
          </Panel>
          <Notice>قاعدة قابلة للتعديل من الإعدادات حسب الصلاحية. العقود تحتفظ بإصدار القاعدة وقت الإنشاء. الرصيد المتناقص غير متاح حاليًا.</Notice>
          {schedule && rule && (
            <Panel title="معاينة الحساب">
              <DetailList
                items={[
                  {
                    label: "العائد = الأصل × النسبة السنوية × الأشهر ÷ 12",
                    value: (
                      <span className="num">
                        {formatAmount(schedule.principal, { whole: schedule.principal % 100 === 0 })} × {formatPercent(rule.annualRateBp / 100)} × {term} ÷ 12
                      </span>
                    ),
                  },
                  { label: "عائد التمويل", value: <span className="num">{money(schedule.profit)}</span> },
                  { label: "إجمالي الأقساط دون المقدم", value: <span className="num">{money(schedule.total)}</span> },
                  { label: "القسط الشهري التقريبي", value: <span className="num">{money(schedule.installment)}</span> },
                ]}
              />
            </Panel>
          )}
        </>
      )}

      {step === 5 && schedule && (
        <>
          <Panel title={`الجدول الكامل • ${installmentsCountLabel(schedule.rows.length)}`}>
            <DataTable caption="جدول الأقساط" columns={scheduleColumns} rows={schedule.rows} rowKey={(r) => String(r.seq)} />
          </Panel>
          <Notice tone="success">
            إجمالي الأصل <span className="num">{money(schedule.principal)}</span> + العائد <span className="num">{money(schedule.profit)}</span>
            {schedule.fees > 0 && (
              <>
                {" "}
                + الرسوم <span className="num">{money(schedule.fees)}</span>
              </>
            )}{" "}
            = <span className="num">{money(schedule.total)}</span> جنيه.
            {schedule.rows.at(-1)!.amount !== schedule.installment && (
              <>
                {" "}
                فرق التقريب مُسوّى في القسط الأخير (<span className="num">{money(schedule.rows.at(-1)!.amount)}</span>).
              </>
            )}
          </Notice>
        </>
      )}

      {step === 6 && schedule && customer && (
        <>
          <Panel title="مراجعة العقد قبل الإنشاء">
            <DetailList
              items={[
                {
                  label: "العميل",
                  value: (
                    <>
                      {customer.fullName} • <span className="num">{customer.code}</span>
                    </>
                  ),
                },
                { label: "بيانات الشراء", value: `${product.trim()} × ${qty}` },
                { label: "تكلفة الشراء", value: <span className="num">{money(costP!)}</span> },
                { label: "المقدم", value: <span className="num">{money(downP!)}</span> },
                { label: "أصل التمويل", value: <span className="num">{money(schedule.principal)}</span> },
                { label: "العائد", value: <span className="num">{money(schedule.profit)}</span> },
                { label: "الرسوم", value: <span className="num">{money(schedule.fees)}</span> },
                { label: "إجمالي الأقساط", value: <span className="num">{money(schedule.total)}</span> },
                { label: "سعر البيع بالتقسيط", value: <span className="num">{money(downP! + schedule.total)}</span> },
                { label: "أول قسط / عدد الأقساط", value: `${formatDate(firstDue)} / ${schedule.rows.length}` },
              ]}
            />
          </Panel>
          {customer.activeContracts > 0 && (
            <Notice tone="warning">
              للعميل {activeContractsLabel(customer.activeContracts)} ورصيد <span className="num">{formatAmount(customer.outstanding, { whole: true })}</span> جنيه.
              راجع القدرة على السداد قبل التأكيد.
            </Notice>
          )}
          {!canConfirm && <Notice>تأكيد العقود متاح لصاحب الحساب والمدير. يمكنك حفظ العقد كمسودة.</Notice>}
        </>
      )}

      <div className="flex flex-wrap justify-end gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-40">
        {planReady && (
          <Button variant="ghost" disabled={pending} onClick={() => save(false)}>
            حفظ مسودة
          </Button>
        )}
        {step > 1 && (
          <Button variant="outline" disabled={pending} startIcon={<Icon name="arrow" className="rotate-180" />} onClick={() => goTo(step - 1)}>
            السابق
          </Button>
        )}
        {step < 6 ? (
          <Button endIcon={<Icon name="arrow" />} onClick={() => goTo(step + 1)}>
            متابعة
          </Button>
        ) : (
          canConfirm && (
            <Button loading={pending} loadingText="جارٍ الإنشاء…" onClick={() => save(true)}>
              إنشاء العقد
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/** Step 1: search and pick the customer, then show their current exposure. */
function CustomerStep({
  customer,
  onSelect,
  error,
}: {
  customer: CustomerOption | null;
  onSelect: (c: CustomerOption | null) => void;
  error?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerOption[] | null>(null);

  useEffect(() => {
    if (customer) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const found = await searchCustomersAction(q);
      if (!stale) setResults(found);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, customer]);

  if (!customer) {
    return (
      <>
        <TextField label="اختر العميل" kind="search" placeholder="الاسم / الهاتف / رقم العميل" value={q} onChange={(e) => setQ(e.target.value)} error={error} autoFocus />
        <Panel>
          {results === null ? (
            <p className="text-body text-secondary">جارٍ البحث…</p>
          ) : results.length === 0 ? (
            <p className="text-body text-secondary">لا يوجد عميل مطابق. جرّب الاسم أو رقم الهاتف، أو أضف عميلًا جديدًا.</p>
          ) : (
            <ul className="flex flex-col">
              {results.map((c) => (
                <li key={c.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-control px-2 py-3 text-start outline-none hover:bg-bg focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-inset"
                  >
                    <span className="flex flex-col">
                      <span className="text-body text-navy">{c.fullName}</span>
                      <span className="text-caption text-secondary">
                        <span className="num">{c.code}</span> • <span className="num">{c.phone}</span>
                      </span>
                    </span>
                    {c.status === "noBalance" ? <Badge tone="success">بدون رصيد</Badge> : <Badge status={c.status} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div>
          <ButtonLink href="/customers/new" variant="outline" className="w-40">
            إضافة عميل جديد
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-20 items-center justify-between gap-4 rounded-control border border-border bg-surface px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-label text-secondary">العميل</span>
          <span className="text-body text-text">
            {customer.fullName} • <span className="num">{customer.code}</span>
          </span>
        </div>
        <Button variant="ghost" onClick={() => onSelect(null)}>
          تغيير
        </Button>
      </div>
      <KpiGrid>
        <KpiCard
          label="رصيد قائم"
          value={formatAmount(customer.outstanding, { whole: true })}
          note={customer.activeContracts > 0 ? "لكل عقد رصيد مستقل" : "لا التزامات حالية"}
        />
        <KpiCard label="عقود نشطة" value={String(customer.activeContracts)} note="مسموح بتعدد العقود" />
        <KpiCard label="متأخرات" value={formatAmount(customer.overdue)} note={customer.overdue > 0 ? "تحتاج متابعة" : "سداد منتظم"} />
      </KpiGrid>
      {customer.status === "blocked" ? (
        <Notice tone="danger">العميل محظور ولا يمكن إنشاء عقود جديدة له.</Notice>
      ) : customer.overdue > 0 ? (
        <Notice tone="danger">على العميل أقساط متأخرة. راجع المتأخرات قبل إنشاء عقد جديد.</Notice>
      ) : (
        customer.activeContracts > 0 && <Notice tone="warning">للعميل عقود نشطة. العقد الجديد سيُنشأ بجدول مستقل ولن يدمج الأرصدة تلقائيًا.</Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );
}
