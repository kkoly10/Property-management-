import { activateLeaseSetupSchema } from "@/lib/validation/homeowner-lease";
import { leaseRequestClient, leaseReply, leaseDatabaseError, requiresJson } from "@/lib/api/homeowner-lease";
export async function POST(request: Request) {
  if (requiresJson(request)) return leaseReply({ error: "Submit confirmation as JSON." }, 415);
  const parsed = activateLeaseSetupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return leaseReply({ error: "Confirm the signed agreement and opening position for this saved revision." }, 400);
  const client = await leaseRequestClient(parsed.data.organizationId);
  if (client.error) return client.error;
  const { data, error } = await client.supabase.rpc("activate_homeowner_lease_setup", {
    p_organization_id: parsed.data.organizationId, p_unit_id: parsed.data.unitId,
    p_expected_revision: parsed.data.expectedRevision, p_opening_confirmed: parsed.data.openingConfirmed,
    p_agreement_confirmed: parsed.data.agreementConfirmed,
  });
  return error ? leaseDatabaseError(error) : leaseReply(data, 201);
}
