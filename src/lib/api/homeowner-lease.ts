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
  if (/REVISION_CONFLICT|IDEMPOTENCY_CONFLICT|ALREADY_ACTIVATED/.test(code)) return leaseReply({ error: "This setup changed in another tab or was already activated. Reload the saved version before continuing.", code }, 409);
  if (/TENANCY_OVERLAP|tenancies_unit_active_unique/.test(code)) return leaseReply({ error: "This space already has a tenancy. Review your saved rental rather than creating it again." }, 409);
  if (code.includes("SIGNED_VERSION_NOT_READY")) return leaseReply({ error: "The exact agreement version is not ready. Wait for scanning or choose the current signed version." }, 422);
  if (code.includes("FIRST_CHARGE_CUTOVER_INVALID")) return leaseReply({ error: "Choose a first charge today or later within the lease. Earlier unpaid amounts belong in the opening balance." }, 422);
  if (code.includes("OCCUPANCY_DATE_MISMATCH")) return leaseReply({ error: "The lease date does not match whether this rental has already started or starts later." }, 422);
  if (error.code === "P0002") return leaseReply({ error: "Save this rental setup before activating it." }, 404);
  if (/^22|^23/.test(error.code ?? "")) return leaseReply({ error: "Check the saved renter, agreement and rent details. Activation was not committed." }, 422);
  return leaseReply({ error: "The result could not be confirmed. Check the saved setup or retry the same request." }, 502);
}
export function requiresJson(request: Request) {
  return !request.headers.get("content-type")?.toLowerCase().startsWith("application/json");
}
