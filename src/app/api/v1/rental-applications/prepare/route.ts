import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { prepareRentalApplicationLeaseSchema } from "@/lib/validation/rental-application";
import { z } from "zod";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = prepareRentalApplicationLeaseSchema.safeParse(await request.json().catch(() => null));
  const key = request.headers.get("idempotency-key");
  if (!parsed.success || !z.uuid().safeParse(key).success) {
    return reply({ error: "Check the application and preparation request." }, 400);
  }
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals." }, 409);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to prepare a lease." }, 401);
  const { data, error } = await supabase.rpc("prepare_rental_application_lease", {
    p_organization_id: parsed.data.organizationId,
    p_application_id: parsed.data.applicationId,
    p_expected_version: parsed.data.expectedVersion,
    p_operation_key: key,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This application is outside your scope." }, 403);
    if (message.includes("APPLICATION_VERSION_CONFLICT")) return reply({ error: "Application changed. Reload and try again." }, 409);
    if (message.includes("ANOTHER_APPLICATION_IN_LEASE_PREPARATION")) return reply({ error: "Another application is already in lease preparation for this rental." }, 409);
    if (message.includes("APPLICATION_PREPARATION_OWNED_BY_ANOTHER_ACTOR")) return reply({ error: "Another manager is preparing the lease for this applicant." }, 409);
    if (message.includes("LEASE_SETUP_ALREADY_IN_PROGRESS")) return reply({ error: "You already have a lease draft for this rental. Finish or clear it first." }, 409);
    if (message.includes("APPLICATION_NOT_READY_FOR_LEASE")) return reply({ error: "This application is no longer ready for lease preparation." }, 409);
    if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This operation key has already been used." }, 409);
    if (error?.code === "P0002") return reply({ error: "Application not found." }, 404);
    return reply({ error: "Lease preparation could not be confirmed. Retry the same operation." }, 502);
  }
  // The RPC transport succeeding is not a verified lease-preparation receipt.
  // Fail closed on a mismatched/incomplete response so callers retry the same
  // idempotency key rather than entering an unconfirmed draft workflow.
  if (data.applicationId !== parsed.data.applicationId || data.status !== "lease_preparation"
    || !Number.isSafeInteger(data.applicationVersion)
    || data.applicationVersion <= parsed.data.expectedVersion
    || !z.uuid().safeParse(data.setupId).success || !z.uuid().safeParse(data.unitId).success
    || !Number.isSafeInteger(data.setupRevision) || data.setupRevision < 1) {
    return reply({ error: "Lease preparation could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(data, 200);
}
