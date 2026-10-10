import { Spinner } from "@/components/ui";

export default function StatementLoading() {
  return (
    <div role="status" className="text-body flex items-center justify-center gap-3 py-24 text-secondary">
      <Spinner />
      جارٍ إعداد كشف الحساب…
    </div>
  );
}
