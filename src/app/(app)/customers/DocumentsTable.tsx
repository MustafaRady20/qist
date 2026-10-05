import { DataTable, type Column } from "@/components/page/DataTable";
import { documentKindLabels } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import type { CustomerDocumentItem } from "@/server/customers/documents";

/** Figma "المستندات" table. File names open the document for staff allowed to (`canOpen`). */
export function DocumentsTable({ customerCode, documents, canOpen }: { customerCode: string; documents: CustomerDocumentItem[]; canOpen: boolean }) {
  const columns: Column<CustomerDocumentItem>[] = [
    {
      key: "file",
      header: "الملف",
      cell: (d) =>
        canOpen ? (
          <a
            href={`/api/v1/customers/${customerCode}/documents/${d.id}`}
            target="_blank"
            rel="noopener"
            className="underline-offset-4 hover:underline"
          >
            <bdi>{d.fileName}</bdi>
          </a>
        ) : (
          <bdi>{d.fileName}</bdi>
        ),
    },
    { key: "kind", header: "النوع", cell: (d) => documentKindLabels[d.kind] },
    { key: "date", header: "تاريخ الرفع", cell: (d) => formatDate(d.createdAt) },
    { key: "by", header: "أضافه", cell: (d) => d.uploadedByName ?? "—" },
  ];
  return <DataTable caption="المستندات" columns={columns} rows={documents} rowKey={(d) => d.id} />;
}
