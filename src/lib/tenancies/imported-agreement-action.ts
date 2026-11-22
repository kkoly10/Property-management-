"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/actions/state";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";

const request = z.object({ organizationId: z.uuid(), tenancyId: z.uuid(), versionId: z.uuid(), confirmed: z.literal("on") });

export async function attachImportedAgreementAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const parsed = request.safeParse({ organizationId: form.get("organizationId"), tenancyId: form.get("tenancyId"),
    versionId: form.get("versionId"), confirmed: form.get("confirmed") });
  if (!parsed.success) return { status: "error", message: "Choose a signed PDF version and confirm it belongs to this tenancy." };
  const input = parsed.data;
  const organizationId = await getActiveOrganizationId();
  if (input.organizationId !== organizationId) return { status: "error", message: "Reopen the tenancy in the intended workspace." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_imported_tenancy_agreement", {
    p_organization_id: organizationId, p_tenancy_id: input.tenancyId, p_document_version_id: input.versionId, p_signed_copy_confirmed: true,
  });
  if (error) {
    const message = error.message === "IMPORT_SIGNED_VERSION_UNAVAILABLE" ? "This PDF version is unavailable. Refresh and select the current scanned copy."
      : error.message === "IMPORT_AGREEMENT_UNAVAILABLE" ? "The tenancy already has a filed version or is closed."
        : "The signed agreement could not be filed. Check your workspace access and try again.";
    return { status: "error", message };
  }
  revalidatePath("/app/tenancies/" + input.tenancyId + "/move-in");
  return { status: "success", message: "Signed agreement filed." };
}
