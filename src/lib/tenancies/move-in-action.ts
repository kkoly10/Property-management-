"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/actions/state";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";

const request = z.object({
  organizationId: z.uuid(),
  tenancyId: z.uuid(),
  operationId: z.uuid(),
  expectedVersion: z.string().regex(/^\d{1,9}$/).transform(Number),
  eventOn: z.iso.date(),
  action: z.enum(["plan", "no_show", "handover"]),
});

const handover = z.object({
  keys: z.string().regex(/^(?:[0-9]{1,2}|100)$/).transform(Number),
  condition: z.string().trim().min(1).max(240),
  keepDates: z.literal("on"),
});

const errorMessages: Record<string, string> = {
  MOVE_IN_VERSION_CONFLICT: "The move-in record changed. Reload this page before trying again.",
  IDEMPOTENCY_CONFLICT: "This form has already been used. Reload the move-in record before trying again.",
  MOVE_IN_INVALID_DATE: "Choose a date within the recorded lease. Actual events must be today or earlier.",
  MOVE_IN_NO_APPOINTMENT: "A no-show must match the date of the planned appointment.",
  MOVE_IN_ACTION_UNAVAILABLE: "This action is unavailable for the current tenancy status. Reload to check the latest record.",
  MOVE_IN_POSSESSION_UNAVAILABLE: "Another household still has possession or returned it on this date.",
};

export async function recordMoveInAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const input = request.safeParse({
    organizationId: form.get("organizationId"),
    tenancyId: form.get("tenancyId"),
    operationId: form.get("operationId"),
    expectedVersion: form.get("expectedVersion"),
    eventOn: form.get("eventOn"),
    action: form.get("action"),
  });
  if (!input.success) return { status: "error", message: "Check the date and reopen the move-in record if necessary." };
  const data = input.data;
  const detail = data.action === "handover"
    ? handover.safeParse({ keys: form.get("keys"), condition: form.get("condition"), keepDates: form.get("keepDates") })
    : null;
  if (detail && !detail.success) return { status: "error", message: "Enter the key count and condition reference, and confirm the existing lease and rent dates." };
  const organizationId = await getActiveOrganizationId();
  if (organizationId !== data.organizationId) return { status: "error", message: "The workspace changed. Reopen the tenancy in its own workspace." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_tenancy_move_in", {
    p_organization_id: organizationId, p_tenancy_id: data.tenancyId, p_expected_version: data.expectedVersion,
    p_operation_id: data.operationId, p_action: data.action, p_event_on: data.eventOn,
    p_keys_transferred: detail?.data.keys ?? null, p_condition_reference: detail?.data.condition ?? null, p_keep_financial_dates: Boolean(detail?.success),
  });
  if (error) return { status: "error", message: errorMessages[error.message] ?? "The move-in action could not be saved. Check access and try again." };
  revalidatePath("/app/tenancies/" + data.tenancyId + "/move-in");
  return { status: "success", message: "Move-in record saved." };
}
