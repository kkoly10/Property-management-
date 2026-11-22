import { NextResponse } from "next/server";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { paymentsToCsv } from "@/lib/payment-exports/csv";
import { createClient } from "@/lib/supabase/server";
import { paymentExportQuerySchema, paymentExportResultSchema } from "@/lib/validation/payment-exports";

const privateHeaders = { "cache-control": "private, no-store" };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, error: message }, { status, headers: privateHeaders });
}

function mfaRedirect(url: URL) {
  const target = new URL("/settings/security/mfa", url.origin);
  target.searchParams.set("returnTo", url.pathname + url.search);
  return NextResponse.redirect(target, { status: 303, headers: privateHeaders });
}

function databaseError(message: string, url: URL) {
  if (message.includes("MFA_REQUIRED")) return mfaRedirect(url);
  if (message.includes("PAYMENT_EXPORT_TOO_LARGE")) {
    return errorResponse("PAYMENT_EXPORT_TOO_LARGE", "Narrow the filters to export at most 5,000 payments.", 422);
  }
  if (message.includes("INVALID_DATE_RANGE") || message.includes("FILTER_COMBINATION_INVALID")) {
    return errorResponse("INVALID_FILTERS", "Use a date range of up to 366 days ending today or earlier, and matching property and book filters.", 400);
  }
  if (["ORGANIZATION_SCOPE_DENIED", "PROPERTY_SCOPE_DENIED", "BOOK_SCOPE_DENIED", "OPERATOR_FINANCE_DENIED"].some((code) => message.includes(code))) {
    return errorResponse("FORBIDDEN", "Finance access is required for this export.", 403);
  }
  return errorResponse("UNAVAILABLE", "The payment export is temporarily unavailable.", 503);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = [...url.searchParams.entries()];
  const parsed = paymentExportQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || params.length !== new Set(params.map(([key]) => key)).size) {
    return errorResponse("INVALID_FILTERS", "Check the workspace, dates, property, and accounting book.", 400);
  }
  const input = parsed.data;
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to export payments.", 401);

    const organizationId = await getActiveOrganizationId();
    if (!organizationId || input.organizationId !== organizationId) {
      return errorResponse("WORKSPACE_CHANGED", "Open Payments in the selected workspace and start the export again.", 409);
    }

    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) return databaseError("", url);
    if (assurance.data.currentLevel !== "aal2") return mfaRedirect(url);

    const { data, error } = await supabase.rpc("get_operator_payment_export_for_organization", {
      p_organization_id: organizationId,
      p_from_date: input.from,
      p_to_date: input.to,
      p_property_id: input.propertyId,
      p_accounting_book_id: input.accountingBookId,
    });
    if (error) return databaseError(error.message, url);

    const output = paymentExportResultSchema.safeParse(data);
    if (!output.success || output.data.scope.organizationId !== organizationId || output.data.rowCount !== output.data.items.length) {
      return databaseError("", url);
    }
    const { fromDate, toDate } = output.data.scope;
    return new NextResponse(paymentsToCsv(output.data.items), {
      headers: {
        ...privateHeaders,
        "content-disposition": 'attachment; filename="crecy-payments-' + fromDate + "-to-" + toDate + '.csv"',
        "content-type": "text/csv; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return databaseError("", url);
  }
}
