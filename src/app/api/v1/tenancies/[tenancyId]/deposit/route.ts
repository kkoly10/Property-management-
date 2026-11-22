import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { depositCommand, depositReceipt } from "@/lib/validation/tenancy-deposit";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

const entryErrors: Record<string, string> = {
  INVALID_DEPOSIT_ENTRY: "Check the amount, date, and external evidence.",
  DEPOSIT_CORRECTION_REASON_REQUIRED: "Enter the reason for revising this obligation.",
  DEPOSIT_OBLIGATION_REQUIRED: "Record the deposit obligation before adding receipt evidence.",
  DEPOSIT_RECEIPT_REFERENCE_EXISTS: "A current receipt already uses this external reference.",
  DEPOSIT_TARGET_INVALID: "Choose an active receipt or disposition from this tenancy and check the date.",
  DEPOSIT_RECEIPT_HAS_DISPOSITIONS: "Correct the receipt’s recorded dispositions before correcting the receipt.",
  DEPOSIT_AMOUNT_EXCEEDS_HELD: "This disposition exceeds the amount still held on the selected receipt.",
  DEPOSIT_CURRENCY_CHANGED: "The tenancy’s current currency differs from the deposit register currency.",
  DEPOSIT_EVIDENCE_NOT_READY: "Choose a clean evidence version for this tenancy from the property’s available deposit documents.",
};

export async function POST(request: Request, { params }: { params: Promise<{ tenancyId: string }> }) {
  const tenancyId = z.uuid().safeParse((await params).tenancyId);
  if (!tenancyId.success) return reply({ error: "Deposit register unavailable." }, 404);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply({ error: "Send the deposit record as JSON." }, 415);
  }
  const parsed = depositCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Check the required fields and external evidence." }, 422);

  const command = parsed.data;
  const context = await getOrganizationContext();
  if (context.state === "error") return reply({ error: "Workspace unavailable. Retry this request." }, 503);
  if (context.state !== "active" || context.active.organizationId !== command.organizationId) {
    return reply({ error: "Select the original workspace and reopen this tenancy." }, 409);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_tenancy_deposit_entry", {
    p_organization_id: context.active.organizationId,
    p_tenancy_id: tenancyId.data,
    p_expected_version: command.expectedVersion,
    p_operation_key: command.operationKey,
    p_entry: command.entry,
  });
  if (error) {
    if (error.code === "28000") return reply({ error: "Sign in again to record deposit evidence." }, 401);
    if (error.code === "P0002" || error.code === "42501") return reply({ error: "Deposit register unavailable." }, 404);
    if (error.message === "DEPOSIT_VERSION_CONFLICT" || error.message === "DEPOSIT_IDEMPOTENCY_CONFLICT") {
      return reply({ error: "The deposit register changed. Reload the tenancy before recording this entry." }, 409);
    }
    if (Object.hasOwn(entryErrors, error.message)) return reply({ error: entryErrors[error.message] }, 422);
  }
  const receipt = depositReceipt.safeParse(data);
  if (error || !receipt.success || receipt.data.tenancyId !== tenancyId.data) {
    return reply({ error: "The result could not be confirmed. Retry the same request." }, 502);
  }
  return reply(receipt.data);
}
