"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { DetailList, KpiGrid, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { KpiCard } from "@/components/page/KpiCard";
import { Panel } from "@/components/page/Panel";
import { Badge, Button, ButtonLink, DateField, Icon, Radio, SelectField, TextField, TextareaField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { activeContractsLabel, formatAmount, formatDate, formatPercent, installmentsCountLabel, parseAmount } from "@/lib/format";
import { customAmountsError, profitBaseLabels } from "@/lib/installments";
import type { ContractInput } from "@/server/contracts/service";
import type { ProfitBase } from "@/server/db/schema";
import { addMonths, buildFlatSchedule, type CustomInstallment, type Schedule, type ScheduleRow } from "@/server/finance/schedule";
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
  originalPrice: number;
  purchaseCost: number;
  downPayment: number;
  financeRuleId: string;
  profitBase: ProfitBase;
  termMonths: number;
  fees: number;
  firstDueDate: string;
  customInstallments: CustomInstallment[];
};

const steps = ["العميل", "بيانات الشراء", "المقدم", "خطة التقسيط", "جدول الأقساط", "المراجعة"];

/** The wizard step that owns each server-side field, to send the user back to the right place. */
const fieldStep: Record<string, number> = {
  customerId: 1,
  productDescription: 2,
  quantity: 2,
  supplier: 2,
  originalPrice: 2,
  purchaseCost: 2,
  downPayment: 3,
  financeRuleId: 4,
  profitBase: 4,
  termMonths: 4,
  fees: 4,
  firstDueDate: 4,
  customInstallments: 5,
};

const profitBaseHints: Record<ProfitBase, string> = {
  principal: "النسبة تُطبّق على المبلغ المموّل فقط (السعر − المقدم).",
  purchase_cost: "النسبة تُطبّق على سعر المنتج كاملًا قبل خصم المقدم. المقدم لا يدخل في الأقساط.",
};

const money = (p: number) => formatAmount(p);
const editable = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

const baseScheduleColumns: Column<ScheduleRow>[] = [
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
/** Position of the manual-amount column: right after the installment amount. */
const manualColumnIndex = baseScheduleColumns.findIndex((c) => c.key === "amount") + 1;

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
  const [original, setOriginal] = useState(draft ? editable(draft.originalPrice) : "");
  const [cost, setCost] = useState(draft ? editable(draft.purchaseCost) : "");
  const [supplier, setSupplier] = useState(draft?.supplier ?? "");
  const [down, setDown] = useState(draft ? editable(draft.downPayment) : "0");
  const [ruleId, setRuleId] = useState(rules.some((r) => r.id === draft?.financeRuleId) ? draft!.financeRuleId : (rules[0]?.id ?? ""));
  const [base, setBase] = useState<ProfitBase>(draft?.profitBase ?? "principal");
  const [months, setMonths] = useState(String(draft?.termMonths ?? 12));
  const [fees, setFees] = useState(draft ? editable(draft.fees) : "0");
  const [firstDue, setFirstDue] = useState(draft && draft.firstDueDate > today ? draft.firstDueDate : addMonths(today, 1));
  /** Typed manual installment amounts by installment number; empty means calculated. */
  const [manual, setManual] = useState<Record<number, string>>(() =>
    Object.fromEntries((draft?.customInstallments ?? []).map((c) => [c.seq, editable(c.amount)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const rule = rules.find((r) => r.id === ruleId);
  const originalP = parseAmount(original);
  const costP = parseAmount(cost);
  const downP = parseAmount(down);
  const feesP = parseAmount(fees);
  const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity) : NaN;
  const term = /^\d+$/.test(months.trim()) ? Number(months) : NaN;

  // Amounts typed for installments beyond the current term are ignored.
  const manualEntries = Object.entries(manual)
    .map(([seq, text]) => ({ seq: Number(seq), text: text.trim() }))
    .filter((m) => m.text && m.seq <= term);
  const manualInvalid = manualEntries.some((m) => !parseAmount(m.text));
  const custom: CustomInstallment[] | null = manualInvalid ? null : manualEntries.map((m) => ({ seq: m.seq, amount: parseAmount(m.text)! }));

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
      if (!originalP) e.originalPrice = "أدخل السعر الأصلي";
      if (!costP) e.purchaseCost = "أدخل سعر البيع";
    }
    if (n === 3) {
      if (downP === null) e.downPayment = "أدخل مبلغ المقدم (0 إن لم يوجد)";
      else if (costP && downP >= costP) e.downPayment = "المقدم يجب أن يكون أقل من سعر البيع";
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
    if (n === 5 && manualEntries.length) {
      if (manualInvalid) e.customInstallments = "أدخل مبالغ الأقساط اليدوية بأرقام أكبر من صفر، أو اترك الخانة فارغة للحساب التلقائي";
      else if (autoSchedule && custom) {
        const error = customAmountsError(autoSchedule.total, autoSchedule.rows.length, custom.map((c) => c.amount));
        if (error) e.customInstallments = error;
        else if (!schedule) e.customInstallments = "تعذر حساب جدول الأقساط بهذه القيم. راجع المبالغ اليدوية.";
      }
    }
    return e;
  };

  /** The plan input shared by both schedules below; null until steps 2–4 are filled in. */
  const planInput =
    !rule || !costP || downP === null || feesP === null || !(term >= 1) || downP >= costP
      ? null
      : {
          principal: costP - downP,
          profitOn: base === "purchase_cost" ? costP : costP - downP,
          annualRateBp: rule.annualRateBp,
          termMonths: term,
          fees: feesP,
          firstDueDate: firstDue,
        };
  const build = (customInstallments: CustomInstallment[]): Schedule | null => {
    try {
      return planInput && buildFlatSchedule({ ...planInput, customInstallments });
    } catch {
      return null;
    }
  };
  /** Fully calculated schedule: what the plan gives before any manual amount. */
  const autoSchedule = build([]);
  /** The schedule that will be saved; null while the manual amounts don't add up. */
  const schedule = custom && build(custom);
  /** What steps 4–5 show: the saved schedule, or the calculated one while manual amounts are being fixed. */
  const preview = schedule ?? autoSchedule;

  const firstInvalid = (upTo: number) => [1, 2, 3, 4, 5].filter((n) => n <= upTo).find((n) => Object.keys(check(n)).length);
  const planReady = firstInvalid(5) === undefined;
  const manualError = step === 5 ? check(5).customInstallments : undefined;

  const scheduleColumns: Column<ScheduleRow>[] = [
    ...baseScheduleColumns.slice(0, manualColumnIndex),
    {
      key: "manual",
      header: "تحديد يدوي (جنيه)",
      cell: (r) => {
        const text = manual[r.seq] ?? "";
        return (
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            aria-label={`مبلغ القسط ${r.seq} يدويًا`}
            aria-invalid={text.trim() && !parseAmount(text) ? true : undefined}
            placeholder="تلقائي"
            value={text}
            onChange={(e) => setManual((m) => ({ ...m, [r.seq]: e.target.value }))}
            className="num text-body h-11 w-28 rounded-control border border-border bg-surface px-2 text-right outline-none placeholder:text-muted focus:border-info aria-invalid:border-danger"
          />
        );
      },
    },
    ...baseScheduleColumns.slice(manualColumnIndex),
  ];

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
    const invalid = firstInvalid(5);
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
      originalPrice: originalP!,
      purchaseCost: costP!,
      downPayment: downP!,
      financeRuleId: rule.id,
      profitBase: base,
      termMonths: term,
      fees: feesP!,
      firstDueDate: firstDue,
      customInstallments: custom ?? [],
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
        .map((f) => fieldStep[f.split(".")[0]])
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
              <TextField
                label="السعر الأصلي (جنيه) • داخلي"
                kind="currency"
                placeholder="55000"
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
                error={errors.originalPrice}
              />
              <TextField label="سعر البيع (جنيه)" kind="currency" placeholder="60000" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.purchaseCost} />
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
                { label: "السعر الأصلي (لا يظهر للعميل)", value: <span className="num">{originalP ? money(originalP) : "—"}</span> },
                { label: "سعر البيع", value: <span className="num">{costP ? money(costP) : "—"}</span> },
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
                { label: "سعر البيع المعتمد", value: <span className="num">{costP ? money(costP) : "—"}</span> },
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
                <fieldset className="flex flex-col gap-2 md:col-span-2">
                  <legend className="text-label mb-2 text-secondary">النسبة تُحسب على</legend>
                  <div className="flex flex-wrap gap-3">
                    {(Object.keys(profitBaseLabels) as ProfitBase[]).map((value) => (
                      <Radio key={value} name="profitBase" value={value} label={profitBaseLabels[value]} checked={base === value} onChange={() => setBase(value)} />
                    ))}
                  </div>
                  <p className="text-caption text-secondary">{profitBaseHints[base]}</p>
                </fieldset>
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
          {preview && planInput && rule && (
            <Panel title="معاينة الحساب">
              <DetailList
                items={[
                  {
                    label: `العائد = ${base === "purchase_cost" ? "سعر المنتج كاملًا" : "الأصل بعد المقدم"} × النسبة السنوية × الأشهر ÷ 12`,
                    value: (
                      <span className="num">
                        {formatAmount(planInput.profitOn, { whole: planInput.profitOn % 100 === 0 })} × {formatPercent(rule.annualRateBp / 100)} × {term} ÷ 12
                      </span>
                    ),
                  },
                  { label: "عائد التمويل", value: <span className="num">{money(preview.profit)}</span> },
                  { label: "إجمالي الأقساط دون المقدم", value: <span className="num">{money(preview.total)}</span> },
                  { label: "القسط الشهري التقريبي", value: <span className="num">{money(preview.installment)}</span> },
                ]}
              />
            </Panel>
          )}
        </>
      )}

      {step === 5 && preview && (
        <>
          <Notice>
            اكتب مبلغ أي قسط في عمود «تحديد يدوي» لتثبيته. الأقساط التي تتركها فارغة تُحسب تلقائيًا بتوزيع المتبقي من إجمالي الأقساط عليها بالتساوي.
          </Notice>
          {manualError && <Notice tone="danger">{manualError}</Notice>}
          <Panel title={`الجدول الكامل • ${installmentsCountLabel(preview.rows.length)}`}>
            <DataTable caption="جدول الأقساط" columns={scheduleColumns} rows={preview.rows} rowKey={(r) => String(r.seq)} />
            {manualEntries.length > 0 && (
              <div>
                <Button variant="outline" onClick={() => setManual({})}>
                  مسح المبالغ اليدوية
                </Button>
              </div>
            )}
          </Panel>
          <Notice tone="success">
            إجمالي الأصل <span className="num">{money(preview.principal)}</span> + العائد <span className="num">{money(preview.profit)}</span>
            {preview.fees > 0 && (
              <>
                {" "}
                + الرسوم <span className="num">{money(preview.fees)}</span>
              </>
            )}{" "}
            = <span className="num">{money(preview.total)}</span> جنيه.
            {manualEntries.length === 0 && preview.rows.at(-1)!.amount !== preview.installment && (
              <>
                {" "}
                فرق التقريب مُسوّى في القسط الأخير (<span className="num">{money(preview.rows.at(-1)!.amount)}</span>).
              </>
            )}
            {schedule && manualEntries.length > 0 && manualEntries.length < schedule.rows.length && (
              <>
                {" "}
                {installmentsCountLabel(manualEntries.length)} يدويًا، والباقي <span className="num">{money(schedule.installment)}</span> للقسط.
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
                { label: "السعر الأصلي (لا يظهر للعميل)", value: <span className="num">{money(originalP!)}</span> },
                { label: "سعر البيع", value: <span className="num">{money(costP!)}</span> },
                { label: "المقدم", value: <span className="num">{money(downP!)}</span> },
                { label: "أصل التمويل", value: <span className="num">{money(schedule.principal)}</span> },
                { label: "العائد", value: <span className="num">{money(schedule.profit)}</span> },
                { label: "العائد محسوب على", value: profitBaseLabels[base] },
                { label: "الرسوم", value: <span className="num">{money(schedule.fees)}</span> },
                { label: "إجمالي الأقساط", value: <span className="num">{money(schedule.total)}</span> },
                { label: "سعر البيع بالتقسيط", value: <span className="num">{money(downP! + schedule.total)}</span> },
                { label: "أول قسط / عدد الأقساط", value: `${formatDate(firstDue)} / ${schedule.rows.length}` },
                { label: "أقساط محددة يدويًا", value: manualEntries.length ? installmentsCountLabel(manualEntries.length) : "لا يوجد — الحساب تلقائي" },
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
