import { Button, DateField } from "@/components/ui";
import type { DateRange } from "@/server/finance/period";

/** Custom period: two dates submitted via GET (`from`, `to`), keeping the other params. */
export function RangeForm({ range, keep = {} }: { range: DateRange; keep?: Record<string, string | undefined> }) {
  return (
    <form className="flex flex-col gap-3 md:flex-row md:items-center">
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <DateField label="من" name="from" defaultValue={range.from} required className="md:w-56" />
      <DateField label="إلى" name="to" defaultValue={range.to} min={range.from} required className="md:w-56" />
      <Button type="submit" variant="outline" className="md:w-32">
        تطبيق
      </Button>
    </form>
  );
}
