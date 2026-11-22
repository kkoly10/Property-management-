import type { PaymentExportItem } from "@/lib/validation/payment-exports";

const headings = [
  "payment_id", "public_reference", "activity_at", "received_at",
  "property_id", "property_name", "accounting_book_id", "unit_code",
  "household_name", "payment_source", "status", "reconciliation_status",
  "amount_minor", "allocated_minor", "currency_code",
];

function csvText(value: string | null) {
  const text = value ?? "";
  // A leading formula character or control separator may be interpreted by spreadsheet programs.
  const safe = /^(?:[\t\r\n]|\s*[=+\-@])/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function paymentsToCsv(items: readonly PaymentExportItem[]) {
  const rows = items.map((item) => [
    item.paymentId, item.publicReference, item.activityAt, item.receivedAt,
    item.propertyId, item.propertyName, item.accountingBookId, item.unitCode,
    item.householdName, item.paymentSource, item.status, item.reconciliationStatus,
  ].map(csvText).concat([item.amountMinor, item.allocatedMinor, csvText(item.currencyCode)]).join(","));
  return "\uFEFF" + [headings.map(csvText).join(","), ...rows].join("\r\n") + "\r\n";
}
