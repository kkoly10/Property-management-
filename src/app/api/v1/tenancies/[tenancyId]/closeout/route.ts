import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { closeoutCommand, closeoutReceipt } from "@/lib/validation/tenancy-closeout";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ tenancyId: string }> }) {
  const tenancyId = z.uuid().safeParse((await params).tenancyId);
  if (!tenancyId.success) return reply({ error: "Tenancy unavailable." }, 404);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply({ error: "Send the closeout as JSON." }, 415);
  }

  const parsed = closeoutCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Check the date and confirm that possession was returned." }, 422);
  const command = parsed.data;
  const context = await getOrganizationContext();
  if (context.state === "error") return reply({ error: "Workspace unavailable. Retry this request." }, 503);
  if (context.state !== "active" || context.active.organizationId !== command.organizationId) {
    return reply({ error: "Select the original workspace and reopen this tenancy." }, 409);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_tenancy_closeout", {
    p_organization_id: context.active.organizationId,
    p_tenancy_id: tenancyId.data,
    p_action: command.action,
    p_expected_version: command.expectedVersion,
    p_effective_on: command.action === "cancel" ? null : command.effectiveOn,
    p_return_confirmed: command.action === "record_return",
    p_idempotency_key: command.idempotencyKey,
  });
  if (error) {
    if (error.code === "28000") return reply({ error: "Sign in again to finish this closeout." }, 401);
    if (error.code === "P0002" || error.code === "42501") return reply({ error: "Tenancy unavailable." }, 404);
    if (error.message === "CLOSEOUT_DATE_OUT_OF_RANGE") {
      return reply({ error: "Choose a date within the allowed range for this tenancy." }, 422);
    }
    if (error.message === "INVALID_CLOSEOUT_ACTION") return reply({ error: "Check the requested closeout action." }, 422);
    if (error.message === "CLOSEOUT_VERSION_CONFLICT" || error.message === "CLOSEOUT_IDEMPOTENCY_CONFLICT"
      || error.message === "CLOSEOUT_TRANSITION_UNAVAILABLE") {
      return reply({ error: "This tenancy or its closeout changed. Reload before continuing." }, 409);
    }
  }
  const receipt = closeoutReceipt.safeParse(data);
  if (error || !receipt.success || receipt.data.tenancyId !== tenancyId.data) {
    return reply({ error: "The result could not be confirmed. Retry the same request." }, 502);
  }
  return reply(receipt.data);
}
