"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type DragEvent } from "react";
import { Button, SelectField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DOCUMENT_ACCEPT, DOCUMENT_TOO_LARGE, documentKindLabels, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_MB } from "@/lib/documents";
import type { DocumentKind } from "@/server/db/schema";

const kinds = Object.keys(documentKindLabels) as DocumentKind[];

export function checkDocument(file: File): string | undefined {
  if (file.size > MAX_DOCUMENT_BYTES) return DOCUMENT_TOO_LARGE;
  if (!DOCUMENT_ACCEPT.split(",").includes(file.type)) return "نوع الملف غير مدعوم. ارفع PDF أو JPG أو PNG";
}

/** Sends one file to the documents API; resolves to an error message, or undefined on success. */
export async function uploadDocument(customerCode: string, kind: DocumentKind, file: File): Promise<string | undefined> {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);
  try {
    const res = await fetch(`/api/v1/customers/${customerCode}/documents`, { method: "POST", body });
    if (res.ok) return undefined;
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return json?.error?.message ?? "تعذّر رفع المستند";
  } catch {
    return "تعذّر الاتصال بالخادم. حاول مرة أخرى.";
  }
}

/** Figma "ارفع المستند": drop zone (drag or choose) plus the document type. */
export function DocumentPicker({
  file,
  onFile,
  kind,
  onKind,
  error,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  kind: DocumentKind;
  onKind: (kind: DocumentKind) => void;
  error?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col gap-4 rounded-panel border bg-surface p-6 transition-colors md:flex-row md:items-center md:justify-between",
          dragging ? "border-info bg-infoBg" : error ? "border-danger" : "border-border",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-h4 text-text">ارفع المستند</h3>
          {file ? (
            <p className="text-body truncate text-text">
              <bdi>{file.name}</bdi> <span className="num text-secondary">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            </p>
          ) : (
            <p className="text-body text-secondary">
              اسحب الملف أو اختر من الجهاز • PDF / JPG / PNG • حتى <span className="num">{MAX_DOCUMENT_MB} MB</span>
            </p>
          )}
          {error && (
            <p role="alert" className="text-caption text-dangerText">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          {file && (
            <Button variant="ghost" disabled={disabled} onClick={() => onFile(null)}>
              إزالة
            </Button>
          )}
          <Button variant="outline" className="w-40" disabled={disabled} onClick={() => input.current?.click()}>
            {file ? "تغيير الملف" : "اختيار ملف"}
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="ملف المستند"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>
      {file && (
        <SelectField
          label="نوع المستند"
          value={kind}
          disabled={disabled}
          onChange={(e) => onKind(e.target.value as DocumentKind)}
          className="md:max-w-80"
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {documentKindLabels[k]}
            </option>
          ))}
        </SelectField>
      )}
    </div>
  );
}

/** Picker plus upload button for a customer that already exists (Figma "customer-documents"). */
export function DocumentUploader({ customerCode }: { customerCode: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>("national_id");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const pick = (f: File | null) => {
    setFile(f);
    setError(f ? checkDocument(f) : undefined);
  };

  const upload = () => {
    if (!file || error) return;
    startTransition(async () => {
      const failed = await uploadDocument(customerCode, kind, file);
      if (failed) {
        setError(failed);
        return;
      }
      setFile(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <DocumentPicker file={file} onFile={pick} kind={kind} onKind={setKind} error={error} disabled={pending} />
      {file && (
        <Button className="w-40 self-start" loading={pending} loadingText="جارٍ الرفع…" disabled={!!error} onClick={upload}>
          رفع المستند
        </Button>
      )}
    </div>
  );
}
