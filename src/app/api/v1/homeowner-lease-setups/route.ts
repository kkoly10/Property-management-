import { z } from "zod";
import { leaseSetupTargetSchema, saveLeaseSetupSchema } from "@/lib/validation/homeowner-lease";
import { leaseRequestClient, leaseReply, leaseDatabaseError, requiresJson } from "@/lib/api/homeowner-lease";
export async function GET(request: Request) {
  const parsed = leaseSetupTargetSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return leaseReply({ error: "Choose a valid rental." }, 400);
  const client = await leaseRequestClient(parsed.data.organizationId);
  if (client.error) return client.error;
  const { data, error } = await client.supabase.rpc("get_homeowner_lease_setup", { p_organization_id: parsed.data.organizationId, p_unit_id: parsed.data.unitId });
  return error ? leaseDatabaseError(error) : leaseReply(data);
}
export async function POST(request: Request) {
  if (requiresJson(request)) return leaseReply({ error: "Submit rental setup as JSON." }, 415);
  const parsed = saveLeaseSetupSchema.safeParse(await request.json().catch(() => null));
  const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success || !key.success) return leaseReply({ error: "Check the draft and its save identifier." }, 400);
  const client = await leaseRequestClient(parsed.data.organizationId);
  if (client.error) return client.error;
  const { data, error } = await client.supabase.rpc("save_homeowner_lease_setup", {
    p_organization_id: parsed.data.organizationId, p_unit_id: parsed.data.unitId, p_expected_revision: parsed.data.expectedRevision,
    p_draft: parsed.data.draft, p_operation_key: key.data,
  });
  return error ? leaseDatabaseError(error) : leaseReply(data);
}
