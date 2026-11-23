"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/actions/state";
import { getAgreementSession } from "@/lib/data/rental-agreements";

const inputSchema = z.object({ agreementId: z.uuid(), organizationId: z.uuid(), confirmFiling: z.literal("on") });

export async function fileAgreementAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const request = inputSchema.safeParse({
    agreementId: form.get("agreementId"),
    organizationId: form.get("organizationId"),
    confirmFiling: form.get("confirmFiling"),
  });
  if (!request.success) return { status: "error", message: "Confirm that this exact agreement belongs in tenancy setup." };
  const session = await getAgreementSession("operator");
  if (session.mode !== "ready" || session.organizationId !== request.data.organizationId) {
    return { status: "error", message: "The active workspace changed. Reopen this agreement in its workspace." };
  }
  const { data, error } = await session.supabase.rpc("file_executed_rental_agreement", {
    p_organization_id: session.organizationId,
    p_agreement_id: request.data.agreementId,
  });
  if (error) {
    const messages: Record<string, string> = {
      MFA_REQUIRED: "Verify with your authenticator, then try again.",
      AGREEMENT_EXECUTION_REQUIRED: "All named parties must sign before filing.",
      AGREEMENT_SOURCE_UNAVAILABLE: "The exact PDF is no longer available for filing or has already been filed under another agreement.",
      AGREEMENT_ISSUED_ADDRESS_UNAVAILABLE: "Create a new signing request. This package predates the renter verification required for tenancy setup.",
    };
    return { status: "error", message: messages[error.message] ?? "The agreement could not be filed. Verify access and try again." };
  }
  const receipt = z.object({ agreementId: z.uuid(), documentId: z.uuid() }).safeParse(data);
  if (!receipt.success || receipt.data.agreementId !== request.data.agreementId) {
    return { status: "error", message: "Filing could not be confirmed. Retry the same request." };
  }
  revalidatePath("/app/agreements/" + request.data.agreementId);
  revalidatePath("/app/rentals/[unitId]/setup", "page");
  revalidatePath("/app/leases/record");
  return { status: "success", message: "Filed for tenancy setup." };
}
