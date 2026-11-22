import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { renewalCommand, renewalReceipt } from "@/lib/validation/tenancy-renewal";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

const renewalErrors: Record<string, string> = {
  RENEWAL_TERM_UNAVAILABLE: "The tenancy or its current term changed. Reopen the renewal before continuing.",
  RENEWAL_DATE_INVALID: "The renewed term must end on or after its start.",
  RENEWAL_FIRST_CHARGE_INVALID: "Confirm the first charge that follows the existing rent cadence.",
  RENEWAL_RENT_SCHEDULE_UNAVAILABLE: "Review the current rent schedule. A paused, conflicting, or past charge needs separate accounting review.",
  RENEWAL_DOCUMENT_NOT_READY: "Choose the current clean version of the signed renewal PDF.",
  RENEWAL_DOCUMENT_RESERVED: "This document is already reserved for a renewal.",
  RENEWAL_EFFECTIVE_DATE_UNAVAILABLE: "Apply the renewal within its term while the same household still holds possession.",
  RENEWAL_TENANCY_UNAVAILABLE: "The unit, receivable, or accounting book is unavailable.",
  INVALID_RENEWAL_REQUEST: "Check the dates, document, and confirmation.",
};

export async function POST(request: Request, { params }: { params: Promise<{ tenancyId: string }> }) {
  const id = z.uuid().safeParse((await params).tenancyId);
  if (!id.success) return reply({ error: "Tenancy unavailable." }, 404);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply({ error: "Send the renewal as JSON." }, 415);
  }
  const parsed = renewalCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Check the renewal dates, document, and confirmation." }, 422);
  const command = parsed.data;
  const context = await getOrganizationContext();
  if (context.state === "error") return reply({ error: "Workspace unavailable. Retry this request." }, 503);
  if (context.state !== "active" || context.active.organizationId !== command.organizationId) {
    return reply({ error: "Select the original workspace and reopen this tenancy." }, 409);
  }

  const supabase = await createClient();
  const scheduling = command.action === "schedule";
  const { data, error } = await supabase.rpc("transition_tenancy_renewal", {
    p_organization_id: context.active.organizationId,
    p_tenancy_id: id.data,
    p_action: command.action,
    p_operation_key: command.operationKey,
    p_renewal_id: scheduling ? null : command.renewalId,
    p_prior_lease_id: scheduling ? command.priorLeaseId : null,
    p_end_on: scheduling ? command.endOn : null,
    p_first_charge_on: scheduling ? command.firstChargeOn : null,
    p_document_version_id: scheduling ? command.documentVersionId : null,
    p_confirmed: scheduling,
  });
  if (error) {
    if (error.code === "28000") return reply({ error: "Sign in again to update this renewal." }, 401);
    if (error.code === "P0002" || error.code === "42501") return reply({ error: "Tenancy unavailable." }, 404);
    if (error.code === "23P01") return reply({ error: "Another tenancy already reserves part of the renewal term." }, 409);
    if (error.message === "RENEWAL_RETRY_CONFLICT") return reply({ error: "This retry differs from the original request. Reload the renewal." }, 409);
    if (error.message === "RENEWAL_TERM_UNAVAILABLE") return reply({ error: renewalErrors[error.message] }, 409);
    if (Object.hasOwn(renewalErrors, error.message)) return reply({ error: renewalErrors[error.message] }, 422);
  }
  const receipt = renewalReceipt.safeParse(data);
  if (error || !receipt.success || receipt.data.tenancyId !== id.data) {
    return reply({ error: "The result could not be confirmed. Retry the same request." }, 502);
  }
  return reply(receipt.data);
}
