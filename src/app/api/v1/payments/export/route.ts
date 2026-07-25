import { NextResponse } from "next/server";
import { createCsv } from "@/lib/exports/csv";
import { createClient } from "@/lib/supabase/server";
import { paymentExportQuerySchema } from "@/lib/validation/payment-exports";

type PaymentExportItem = {
  paymentId: string;
  publicReference: string;
  activityAt: string;
  receivedAt: string | null;
  propertyId: string;
  propertyName: string;
  accountingBookId: string;
  unitCode: string;
  householdName: string;
  paymentSource: string;
  status: string;
  reconciliationStatus: string;
  amountMinor: string;
  allocatedMinor: string;
  currencyCode: string;
};

type PaymentExport = {
  scope: { fromDate: string; toDate: string };
  items: PaymentExportItem[];
};

const headers = [
  "payment_id",
  "public_reference",
  "activity_at",
  "received_at",
  "property_id",
  "property_name",
  "accounting_book_id",
  "unit_code",
  "household_name",
  "payment_source",
  "status",
  "reconciliation_status",
  "amount_minor",
  "allocated_minor",
  "currency_code",
] as const;

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ code, error: message }, { status, headers: { "cache-control": "private, no-store" } });

function databaseError(message: string) {
  if (message.includes("PAYMENT_EXPORT_TOO_LARGE")) {
    return errorResponse("PAYMENT_EXPORT_TOO_LARGE", "Narrow the date or property filters to export at most 5,000 payments.", 422);
  }
  if (message.includes("INVALID_DATE_RANGE") || message.includes("FILTER_COMBINATION_INVALID")) {
    return errorResponse("INVALID_FILTERS", "Use a valid past date range of no more than 366 days and matching property/book filters.", 400);
  }
  if (message.includes("PROPERTY_SCOPE_DENIED") || message.includes("BOOK_SCOPE_DENIED") || message.includes("OPERATOR_FINANCE_DENIED")) {
    return errorResponse("FORBIDDEN", "Finance access is required for every property in this export.", 403);
  }
  return errorResponse("SERVICE_UNAVAILABLE", "The payment export is temporarily unavailable.", 503);
}

function utcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = paymentExportQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return errorResponse("INVALID_FILTERS", "Check the export dates, property, and accounting book.", 400);

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const fromDate = parsed.data.from ?? utcDate(defaultFrom);
  const toDate = parsed.data.to ?? utcDate(today);

  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to export payments.", 401);

    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== "aal2") {
      const verifyUrl = new URL("/settings/security/mfa", url.origin);
      verifyUrl.searchParams.set("returnTo", `${url.pathname}${url.search}`);
      return NextResponse.redirect(verifyUrl);
    }

    const result = await supabase.rpc("get_operator_payment_export", {
      p_from_date: fromDate,
      p_to_date: toDate,
      p_property_id: parsed.data.propertyId ?? null,
      p_accounting_book_id: parsed.data.accountingBookId ?? null,
    });
    if (result.error || !result.data) return databaseError(result.error?.message ?? "SERVICE_UNAVAILABLE");

    const paymentExport = result.data as PaymentExport;
    const csv = createCsv(headers, paymentExport.items.map((item) => [
      item.paymentId,
      item.publicReference,
      item.activityAt,
      item.receivedAt,
      item.propertyId,
      item.propertyName,
      item.accountingBookId,
      item.unitCode,
      item.householdName,
      item.paymentSource,
      item.status,
      item.reconciliationStatus,
      item.amountMinor,
      item.allocatedMinor,
      item.currencyCode,
    ]));
    const filename = `crecy-payments-${paymentExport.scope.fromDate}-to-${paymentExport.scope.toDate}.csv`;

    return new NextResponse(csv, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": "text/csv; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", "The payment export is temporarily unavailable.", 503);
  }
}
