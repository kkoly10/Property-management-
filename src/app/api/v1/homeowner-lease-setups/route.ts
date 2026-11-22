import { z } from "zod";
import { leaseEpisodeSelectorSchema, leaseSetupTargetSchema, saveLeaseSetupSchema } from "@/lib/validation/homeowner-lease";
import { leaseRequestClient, leaseReply, leaseDatabaseError, requiresJson } from "@/lib/api/homeowner-lease";
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = leaseSetupTargetSchema.safeParse(query);
  const selector = leaseEpisodeSelectorSchema.safeParse(query);
  if (!parsed.success || !selector.success) return leaseReply({ error: "Choose a valid rental and setup." }, 400);
  const client = await leaseRequestClient(parsed.data.organizationId);
  if (client.error) return client.error;
  const { data, error } = await client.supabase.rpc("get_homeowner_lease_episode", {
    p_organization_id: parsed.data.organizationId, p_unit_id: parsed.data.unitId,
    p_setup_id: selector.data.setupId ?? null, p_application_id: selector.data.applicationId ?? null, p_new: selector.data.new === "1",
  });
  return error ? leaseDatabaseError(error) : leaseReply(data);
}
export async function POST(request: Request) {
  if (requiresJson(request)) return leaseReply({ error: "Submit rental setup as JSON." }, 415);
  const parsed = saveLeaseSetupSchema.safeParse(await request.json().catch(() => null));
  const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success || !key.success) return leaseReply({ error: "Check the draft and its save identifier." }, 400);
  const client = await leaseRequestClient(parsed.data.organizationId);
  if (client.error) return client.error;
  const { data, error } = await client.supabase.rpc("save_homeowner_lease_episode", {
    p_organization_id: parsed.data.organizationId, p_unit_id: parsed.data.unitId, p_setup_id: parsed.data.setupId, p_expected_revision: parsed.data.expectedRevision,
    p_draft: parsed.data.draft, p_operation_key: key.data,
  });
  return error ? leaseDatabaseError(error) : leaseReply(data);
}
