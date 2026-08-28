"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { organizationSchema } from "@/lib/validation/onboarding";
import { resolveOrganizationConsent, requiresPublishedLegalDocuments, DeploymentEnvironmentError } from "@/lib/legal/registry";
import { setActiveOrganization } from "@/lib/organization/actions";
import type { ActionState } from "@/lib/actions/state";

/**
 * Create the operator's organization.
 *
 * This is the AUTHORITATIVE write boundary, not merely the UI path. Two things make it one:
 *
 *   * the actor id is derived here from `auth.getUser()` and passed to a `service_role`-only command.
 *     The browser never supplies an actor and never holds the service-role key;
 *   * the consent binding is re-resolved on the server and must match, exactly, the binding the page
 *     rendered. A submission that cannot name the documents it accepted is refused.
 *
 * Putting the gate only in this function would not have been enough while `create_organization`
 * remained callable from the browser with an arbitrary `p_terms_version` — that hole is closed by the
 * contract release, which removes the browser grant.
 */
export async function createOrganizationAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  // The version sent to the command is DERIVED from the documents the server can actually produce,
  // never from a literal and never from the client. This once sent a hardcoded "2026-07-20" — a date
  // with no corresponding artifact — next to a checkbox that linked to nothing.
  let consent;
  try {
    consent = resolveOrganizationConsent({ requirePublished: requiresPublishedLegalDocuments() });
  } catch (error) {
    // A misconfigured deployment environment must not silently relax the publication gate.
    if (error instanceof DeploymentEnvironmentError) {
      return { status: "error", message: "This deployment is misconfigured and cannot record consent. Contact Crecy support." };
    }
    throw error;
  }

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

  // EXACT match, not "compare if present". The submitted version is required by the schema, so the
  // only way to reach here with a different one is that the artifacts changed between render and
  // submit — in which case the user has accepted something that is no longer current.
  if (result.data.consentVersion !== consent.binding.version) {
    return {
      status: "error",
      message: "The Terms or Privacy Notice changed while you were on this page. Reload and review the current version before continuing.",
    };
  }

  let organizationId: string;
  try {
    // The actor is derived server-side from the session. A browser-supplied id would let any
    // signed-in user create an organization owned by someone else.
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { status: "error", message: "Your session expired. Sign in and try again." };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_organization_as_actor", {
      p_actor_user_id: userData.user.id,
      p_display_name: result.data.displayName,
      p_slug: result.data.slug,
      p_customer_path: result.data.customerPath,
      p_headquarters_country_code: result.data.headquartersCountryCode,
      p_default_locale: result.data.defaultLocale,
      p_default_time_zone: result.data.defaultTimeZone,
      p_terms_version: consent.binding.version,
      p_idempotency_key: result.data.idempotencyKey,
    });

    if (error || !data) {
      const code = error?.message ?? "";
      if (code.includes("IDEMPOTENCY_CONFLICT")) return { status: "error", message: "That request was already used with different details. Reload and try again." };
      if (code.includes("COMMAND_IN_PROGRESS")) return { status: "error", message: "This workspace is already being created." };
      if (code.includes("CONSENT_VERSION_REQUIRED")) return { status: "error", message: "The accepted Terms and Privacy Notice version is missing. Reload and try again." };
      if (code.includes("duplicate key") || code.includes("organizations_slug")) return { status: "error", message: "That workspace URL is taken. Choose another.", fieldErrors: { slug: ["That workspace URL is taken."] } };
      return { status: "error", message: error?.message ?? "Unable to create the workspace.", requestId: crypto.randomUUID() };
    }

    organizationId = String((data as { organizationId?: unknown }).organizationId ?? "");
    if (!organizationId) return { status: "error", message: "The workspace was created but returned no identifier.", requestId: crypto.randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the workspace.", requestId: crypto.randomUUID() };
  }

  // Make the organization the operator JUST created the active one, using the id the command
  // returned. Inferring it from membership ordering would be exactly the implicit-organization bug
  // A3 removed — and for an operator who already belongs to another organization it would silently
  // continue onboarding inside the WRONG tenant, putting the entity, book and first property there.
  await setActiveOrganization(organizationId);

  redirect("/onboarding/entity");
}
