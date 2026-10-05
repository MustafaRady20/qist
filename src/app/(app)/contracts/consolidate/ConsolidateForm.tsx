"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DetailList, Notice } from "@/components/page/blocks";
import { DataTable, type Column } from "@/components/page/DataTable";
import { Panel } from "@/components/page/Panel";
import { Badge, Button, Checkbox, TextField, TextareaField } from "@/components/ui";
import { contractsCountLabel, formatAmount, formatDate } from "@/lib/format";
import { createGroupAction } from "../actions";

export type GroupableContract = {
  id: string;
  code: string;
  productDescription: string;
  paid: number;
  outstanding: number;
  status: "active" | "overdue";
  /** Next unpaid installment. */
  next: { dueDate: string; remaining: number; status: "partial" | "overdue" | "due" | "upcoming" } | null;
};

const whole = (p: number) => formatAmount(p, { whole: true });

/** Figma "consolidation" (pick contracts, name the group) then "consolidation-preview". */
export function ConsolidateForm({
  customer,
  contracts,
}: {
  customer: { id: string; code: string; fullName: string };
  contracts: GroupableContract[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "preview">("select");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(contracts.map((c) => c.id)));
  const [name, setName] = useState(`مشتريات ${customer.fullName.split(" ")[0]} • ${contractsCountLabel(contracts.length)}`);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const chosen = contracts.filter((c) => selected.has(c.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const review = () => {
    const e: Record<string, string> = {};
    if (chosen.length < 2) e.contractIds = "اختر عقدين على الأقل";
    if (name.trim().length < 2) e.name = "أدخل اسم المجموعة";
    setErrors(e);
    if (Object.keys(e).length === 0) {
      setStep("preview");
      window.scrollTo({ top: 0 });
    }
  };

  const save = () =>
    startTransition(async () => {
      const result = await createGroupAction({ customerId: customer.id, contractIds: chosen.map((c) => c.id), name, note });
      if (result.ok) router.push(`/contracts/groups/${result.id}?created=1`);
      else setError(result.error);
    });

  if (step === "select") {
    const columns: Column<GroupableContract>[] = [
      {
        key: "pick",
        header: "اختيار",
        cell: (c) => <Checkbox label={<span className="sr-only">اختيار العقد {c.code}</span>} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />,
      },
      { key: "code", header: "العقد", cell: (c) => c.code, numeric: true },
      { key: "product", header: "المشتريات", cell: (c) => c.productDescription },
      { key: "installment", header: "قيمة القسط", cell: (c) => (c.next ? whole(c.next.remaining) : "—"), numeric: true },
      { key: "due", header: "ميعاد القسط", cell: (c) => (c.next ? formatDate(c.next.dueDate) : "—") },
      { key: "paid", header: "المدفوع", cell: (c) => whole(c.paid), numeric: true },
      { key: "status", header: "الحالة", cell: (c) => <Badge status={c.status} /> },
      { key: "outstanding", header: "المتبقي", cell: (c) => whole(c.outstanding), numeric: true },
    ];
    return (
      <>
        <Panel title="اختر العقود لتجميع متابعتها">
          <DataTable caption="عقود العميل النشطة" columns={columns} rows={contracts} rowKey={(c) => c.id} />
          {errors.contractIds && (
            <p role="alert" className="text-caption text-dangerText">
              {errors.contractIds}
            </p>
          )}
        </Panel>
        <Notice tone="warning">يمكن تجميع عقدين بقسطين مختلفين وبنفس الموعد أو موعدين مختلفين. التجميع لا يغيّر قيمة الأقساط أو تواريخها.</Notice>
        <TextField label="اسم المجموعة" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <div>
          <Button className="w-full md:w-52" onClick={review}>
            مراجعة المجموعة
          </Button>
        </div>
      </>
    );
  }

  const upcoming = chosen.filter((c) => c.next).sort((a, b) => a.next!.dueDate.localeCompare(b.next!.dueDate));
  const dates = new Set(upcoming.map((c) => c.next!.dueDate));
  const previewColumns: Column<GroupableContract>[] = [
    { key: "code", header: "العقد", cell: (c) => c.code, numeric: true },
    { key: "due", header: "الاستحقاق", cell: (c) => formatDate(c.next!.dueDate) },
    { key: "amount", header: "المبلغ", cell: (c) => whole(c.next!.remaining), numeric: true },
    { key: "status", header: "الحالة", cell: (c) => <Badge status={c.next!.status} className="min-w-28" /> },
  ];

  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}
      <Panel title="ملخص المجموعة">
        <DetailList
          items={[
            { label: "اسم المجموعة", value: name.trim() },
            { label: "العقود المختارة", value: <>{contractsCountLabel(chosen.length)} • <span className="num">{chosen.map((c) => c.code).join(" + ")}</span></> },
            { label: "إجمالي المتبقي", value: <><span className="num">{whole(chosen.reduce((s, c) => s + c.outstanding, 0))}</span> جنيه</> },
            { label: "قسط كل عقد", value: <><span className="num">{upcoming.map((c) => whole(c.next!.remaining)).join(" + ")}</span> جنيه</> },
            { label: "مواعيد الاستحقاق", value: dates.size === 1 ? "نفس موعد الاستحقاق" : "مواعيد مختلفة، كلٌّ في موعده" },
            { label: "حالة العقود بعد التجميع", value: "تبقى نشطة بجداول مستقلة" },
          ]}
        />
      </Panel>
      <Panel title="الاستحقاقات القادمة • كل عقد مستقل">
        <DataTable caption="الاستحقاق القادم لكل عقد" columns={previewColumns} rows={upcoming} rowKey={(c) => c.id} />
      </Panel>
      <TextareaField label="ملاحظة للمجموعة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-44">
        <Button variant="outline" disabled={pending} onClick={() => setStep("select")}>
          تعديل الاختيار
        </Button>
        <Button loading={pending} loadingText="جارٍ الحفظ…" onClick={save}>
          حفظ المجموعة
        </Button>
      </div>
    </>
  );
}
