"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Notice } from "@/components/page/blocks";
import { Panel } from "@/components/page/Panel";
import { Button, ButtonLink, TextField, TextareaField } from "@/components/ui";
import { activeContractsLabel, formatAmount } from "@/lib/format";
import type { DocumentKind } from "@/server/db/schema";
import { saveCustomerAction, type CustomerFormState, type DuplicateCustomer } from "./actions";
import { checkDocument, DocumentPicker, uploadDocument } from "./DocumentPicker";

export type CustomerFormValues = {
  code: string;
  fullName: string;
  phone: string;
  altPhone: string | null;
  whatsapp: string | null;
  /** Masked; the stored number is never sent to the form. */
  nationalIdMasked: string | null;
  address: string | null;
  employer: string | null;
  jobTitle: string | null;
  /** Piastres. */
  monthlyIncome: number | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  guarantorRelation: string | null;
  guarantorAddress: string | null;
};

/** Figma "new-customer" / "customer-edit". `customer` switches the form to edit mode. */
export function CustomerForm({
  customer,
  canUpload,
  canCreateContract = false,
}: {
  customer?: CustomerFormValues;
  canUpload: boolean;
  /** Offers "save and create contract" on the new-customer form. */
  canCreateContract?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<CustomerFormState>({});
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>("national_id");
  const [fileError, setFileError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};
  const cancelHref = customer ? `/customers/${customer.code}` : "/customers";

  const pickFile = (f: File | null) => {
    setFile(f);
    setFileError(f ? checkDocument(f) : undefined);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (fileError) return;
    const form = new FormData(e.currentTarget);
    // The second submit button continues straight into the contract wizard.
    const thenContract = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "contract";
    startTransition(async () => {
      const result = await saveCustomerAction(customer?.code ?? null, form);
      if (!result.saved) {
        setState(result);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const { code } = result.saved;
      // The record is saved; a failed upload is retried from the documents page.
      const failed = file ? await uploadDocument(code, kind, file) : undefined;
      router.push(
        failed ? `/customers/${code}/documents?upload=failed` : thenContract ? `/contracts/new?customer=${code}` : `/customers/${code}`,
      );
    });
  };

  return (
    <>
      {state.duplicate && <DuplicateNotice duplicate={state.duplicate} onBack={() => setState({})} />}
      {/* Kept mounted while the duplicate is reviewed so the typed values survive. */}
      <form onSubmit={onSubmit} noValidate hidden={!!state.duplicate} className="flex flex-col gap-6">
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Panel title="البيانات الأساسية">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="الاسم الكامل" name="fullName" defaultValue={customer?.fullName} error={errors.fullName} autoComplete="off" required autoFocus={!customer} />
            <TextField label="رقم العميل" value={customer?.code ?? "يُنشأ تلقائيًا عند الحفظ"} readOnly disabled />
            <TextField label="الهاتف" name="phone" kind="phone" autoComplete="off" placeholder="01001234567" defaultValue={customer?.phone} error={errors.phone} required />
            <TextField label="واتساب" name="whatsapp" kind="phone" autoComplete="off" placeholder="إن اختلف عن الهاتف" defaultValue={customer?.whatsapp ?? ""} error={errors.whatsapp} />
            <TextField
              label={customer?.nationalIdMasked ? "الرقم القومي (اتركه فارغًا للإبقاء عليه)" : "الرقم القومي"}
              name="nationalId"
              kind="phone"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              placeholder={customer?.nationalIdMasked ?? "14 رقمًا"}
              error={errors.nationalId}
            />
            <TextField label="العنوان" name="address" defaultValue={customer?.address ?? ""} error={errors.address} autoComplete="off" />
            <TextField label="الوظيفة" name="jobTitle" defaultValue={customer?.jobTitle ?? ""} error={errors.jobTitle} autoComplete="off" />
            <TextField label="جهة العمل" name="employer" defaultValue={customer?.employer ?? ""} error={errors.employer} autoComplete="off" />
            <TextField
              label="الدخل الشهري (جنيه)"
              name="monthlyIncome"
              kind="currency"
              autoComplete="off"
              defaultValue={customer?.monthlyIncome != null ? formatAmount(customer.monthlyIncome, { whole: customer.monthlyIncome % 100 === 0 }) : ""}
              error={errors.monthlyIncome}
            />
            <TextField label="هاتف بديل" name="altPhone" kind="phone" autoComplete="off" defaultValue={customer?.altPhone ?? ""} error={errors.altPhone} />
            <TextField label="جهة اتصال للطوارئ • الاسم" name="emergencyContactName" defaultValue={customer?.emergencyContactName ?? ""} error={errors.emergencyContactName} autoComplete="off" />
            <TextField label="جهة اتصال للطوارئ • الهاتف" name="emergencyContactPhone" kind="phone" autoComplete="off" defaultValue={customer?.emergencyContactPhone ?? ""} error={errors.emergencyContactPhone} />
          </div>
        </Panel>
        <Panel title="الضامن (اختياري)">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="اسم الضامن" name="guarantorName" defaultValue={customer?.guarantorName ?? ""} error={errors.guarantorName} autoComplete="off" />
            <TextField label="هاتف الضامن" name="guarantorPhone" kind="phone" autoComplete="off" defaultValue={customer?.guarantorPhone ?? ""} error={errors.guarantorPhone} />
            <TextField label="صلة القرابة" name="guarantorRelation" defaultValue={customer?.guarantorRelation ?? ""} error={errors.guarantorRelation} autoComplete="off" />
            <TextareaField label="عنوان الضامن" name="guarantorAddress" defaultValue={customer?.guarantorAddress ?? ""} error={errors.guarantorAddress} />
          </div>
        </Panel>
        {canUpload && <DocumentPicker file={file} onFile={pickFile} kind={kind} onKind={setKind} error={fileError} disabled={pending} />}
        <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1 [&>*]:md:w-40">
          <ButtonLink href={cancelHref} variant="ghost">
            إلغاء
          </ButtonLink>
          {!customer && canCreateContract && (
            <Button type="submit" value="contract" variant="outline" disabled={pending}>
              حفظ وإنشاء عقد
            </Button>
          )}
          <Button type="submit" loading={pending} loadingText="جارٍ الحفظ…">
            {customer ? "حفظ التعديلات" : "حفظ وفتح الملف"}
          </Button>
        </div>
      </form>
    </>
  );
}

/** Figma "duplicate-customer": the phone or national ID already belongs to a customer. */
function DuplicateNotice({ duplicate, onBack }: { duplicate: DuplicateCustomer; onBack: () => void }) {
  return (
    <section aria-labelledby="duplicate-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="duplicate-title" className="text-h2 text-navy">
          عميل محتمل مطابق
        </h2>
        <p className="text-body text-secondary">راجع السجل الموجود قبل الحفظ</p>
      </div>
      <Notice tone="warning">
        {duplicate.field === "phone" ? "رقم الهاتف" : "الرقم القومي"} مرتبط بالعميل {duplicate.fullName} •{" "}
        <span className="num">{duplicate.code}</span>. تجنّب إنشاء سجل مكرر.
      </Notice>
      <Panel title={duplicate.fullName}>
        <p className="text-body text-secondary">
          عميل <span className="num">{duplicate.code}</span> • {activeContractsLabel(duplicate.activeContracts)} • رصيد{" "}
          <span className="num">{formatAmount(duplicate.outstanding, { whole: true })}</span>
        </p>
      </Panel>
      <div className="flex flex-wrap gap-3 [&>*]:max-md:flex-1">
        <ButtonLink href={`/customers/${duplicate.code}`} className="md:w-40">
          فتح السجل الموجود
        </ButtonLink>
        <Button variant="outline" className="md:w-48" onClick={onBack}>
          العودة لتعديل البيانات
        </Button>
      </div>
    </section>
  );
}
