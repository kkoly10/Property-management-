import { NextResponse } from "next/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
export const leaseReply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function leaseRequestClient(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: leaseReply({ error: "Sign in to continue this rental." }, 401) };
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== organizationId)
    return { error: leaseReply({ error: "Your workspace changed. Return to My rentals and select it again." }, 409) };
  if (context.active.customerPath !== "self_managing") return { error: leaseReply({ error: "Open your self-managing workspace." }, 403) };
  return { supabase };
}
export function leaseDatabaseError(error: { code?: string; message?: string }) {
  const code = error.message ?? "";
  if (error.code === "42501") return leaseReply({ error: "You no longer have the required lease, document or financial permission for this rental." }, 403);
  if (/REVISION_CONFLICT|IDEMPOTENCY_CONFLICT|ALREADY_ACTIVATED|SETUP_DRAFT_ALREADY_EXISTS/.test(code)) return leaseReply({ error: "This setup changed in another tab or a draft already exists. Reload the saved setup before continuing.", code }, 409);
  if (/AGREEMENT_SIGNING_ADDRESS_CHANGED/.test(code)) return leaseReply({ error: "A renter’s verified email has changed since signing. Issue a new signing request before activating the tenancy.", code }, 409);
  if (/AGREEMENT_HOUSEHOLD_MISMATCH/.test(code)) return leaseReply({ error: "Responsible renters must match the verified email addresses that signed the filed agreement.", code }, 409);
  if (/AGREEMENT_TENANCY_SCOPE_MISMATCH|AGREEMENT_TENANCY_ALREADY_BOUND/.test(code)) return leaseReply({ error: "This filed agreement is unavailable for the selected tenancy. Check the exact scanned PDF and rental.", code }, 409);
  if (code.includes("TENANCY_HANDBACK_OVERLAP")) return leaseReply({ error: "These dates overlap the previous household’s recorded possession. Choose a start after its handback date." }, 409);
  if (/TENANCY_OVERLAP|tenancies_unit_reservation_dates_excl/.test(code)) return leaseReply({ error: "These dates overlap a recorded tenancy. Choose a start after the previous tenancy’s inclusive end date." }, 409);
  if (/TENANCY_POSSESSION_ACTIVE|tenancies_unit_one_physical_possession/.test(code)) return leaseReply({ error: "Another household still holds possession of this space.", code }, 409);
  if (/tenancies_unit_active_unique|homeowner_lease_setups_.*_key/.test(code)) return leaseReply({ error: "This workspace’s database has not enabled separate tenancy episodes yet.", code }, 409);
  if (code.includes("SIGNED_VERSION_NOT_READY")) return leaseReply({ error: "The exact agreement version is not ready. Wait for scanning or choose the current signed version." }, 422);
  if (code.includes("APPLICATION_AGREEMENT_REQUIRED") || code.includes("AGREEMENT_APPLICATION_SETUP_REQUIRED")) {
    return leaseReply({ error: "Open the original application setup and choose its executed, filed agreement." }, 422);
  }
  if (code.includes("FIRST_CHARGE_CUTOVER_INVALID")) return leaseReply({ error: "Choose a first charge today or later within the lease. Earlier unpaid amounts belong in the opening balance." }, 422);
  if (code.includes("OCCUPANCY_DATE_MISMATCH")) return leaseReply({ error: "The lease date does not match whether this rental has already started or starts later." }, 422);
  if (error.code === "P0002") return leaseReply({ error: "Save this rental setup before activating it." }, 404);
  if (/^22|^23/.test(error.code ?? "")) return leaseReply({ error: "Check the saved renter, agreement and rent details. Activation was not committed." }, 422);
  return leaseReply({ error: "The result could not be confirmed. Check the saved setup or retry the same request." }, 502);
}
export function requiresJson(request: Request) {
  return !request.headers.get("content-type")?.toLowerCase().startsWith("application/json");
}
