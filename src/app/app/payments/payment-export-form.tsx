import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentExportProperty } from "@/lib/validation/payment-exports";

const selectClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PaymentExportForm({ organizationId, properties }: { organizationId: string; properties: PaymentExportProperty[] }) {
  if (properties.length === 0) return null;
  const books = new Map(properties.map((property) => [property.bookId, property.bookName]));

  return (
    <details className="group rounded-xl border bg-card shadow-[var(--shadow-panel)]">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
        Export payments
      </summary>
      <form action="/api/v1/payments/export" method="get" className="space-y-4 border-t px-5 py-4 sm:px-6">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-export-from">From</Label>
            <Input id="payment-export-from" name="from" type="date" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-export-to">Through</Label>
            <Input id="payment-export-to" name="to" type="date" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-export-property">Property</Label>
            <select id="payment-export-property" name="propertyId" className={selectClass}>
              <option value="">All permitted properties</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-export-book">Accounting book</Label>
            <select id="payment-export-book" name="accountingBookId" className={selectClass}>
              <option value="">All permitted books</option>
              {[...books.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Dates use your workspace time zone. Leave both dates blank for the last 30 days.</p>
          <Button type="submit">
            <Download aria-hidden="true" className="h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </form>
    </details>
  );
}
