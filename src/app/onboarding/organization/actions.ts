"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { organizationSchema } from "@/lib/validation/onboarding";
import { resolveOrganizationConsent, requiresPublishedLegalDocuments } from "@/lib/legal/registry";
import type { ActionState } from "@/lib/actions/state";

export async function createOrganizationAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  // The version sent to the command is DERIVED from the documents that were actually shown, not a
  // literal. This previously sent `p_terms_version: "2026-07-20"` — a date with no corresponding
  // artifact anywhere in the product, next to a checkbox that linked to nothing.
  // Resolved WITHOUT a jurisdiction, deliberately, so this always agrees with what the page rendered.
  // The page cannot know the country until the form is filled, so resolving per-country here would make
  // the two disagree the moment a country-specific document exists: the drift guard below would fire,
  // and reloading would re-render the same mismatch, locking onboarding for that country behind a
  // message that misdiagnoses the cause. Jurisdiction-specific documents need the consent block to
  // re-render when the country changes — a tracked follow-up, not something to fake here.
  const consent = resolveOrganizationConsent({ requirePublished: requiresPublishedLegalDocuments() });
  if (!consent.ok) {
    // Fail closed. Recording consent against a document that is not published would be inventing
    // evidence, which is worse than refusing to create the workspace (file 27 §5.A4).
    const detail = consent.missing.join(", ");
    return {
      status: "error",
      message: consent.reason === "LEGAL_DOCUMENT_NOT_PUBLISHED"
        ? `Crecy cannot create a workspace until its binding legal documents are published (${detail}). This is a configuration gate, not a problem with your details.`
        : `A required legal document is missing from this deployment (${detail}). Contact Crecy support.`,
    };
  }

  // The exact versions the form displayed must be the ones being accepted. A mismatch means the page
  // was rendered against a different build than the one handling this submission.
  const displayed = formData.get("consentVersion");
  if (typeof displayed === "string" && displayed && displayed !== consent.binding.version) {
    return {
      status: "error",
      message: "The Terms or Privacy Notice changed while you were on this page. Reload and review the current version before continuing.",
    };
  }

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { status: "error", message: "Your session expired. Sign in and try again." };

    const { error } = await supabase.rpc("create_organization", {
      p_display_name: result.data.displayName,
      p_slug: result.data.slug,
      p_customer_path: result.data.customerPath,
      p_headquarters_country_code: result.data.headquartersCountryCode,
      p_default_locale: result.data.defaultLocale,
      p_default_time_zone: result.data.defaultTimeZone,
      p_terms_version: consent.binding.version,
      p_idempotency_key: result.data.idempotencyKey,
    });

    if (error) return { status: "error", message: error.message, requestId: crypto.randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the workspace.", requestId: crypto.randomUUID() };
  }

  redirect("/onboarding/entity");
}
