"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/actions/state";
import { getAgreementSession, getRentalAgreement, issuedAgreementSchema, signedAgreementReceiptSchema } from "@/lib/data/rental-agreements";
import { resolveEsignConsent } from "@/lib/data/signatures";
import { scheduleCriticalRentalMail } from "@/lib/notifications/rental-fast-mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { signDocumentSchema } from "@/lib/validation/documents";

const surfaceSchema = z.enum(["operator", "participant"]);
const checkbox = z.literal("on");
const issueSchema = z.object({
  organizationId: z.uuid(),
  agreementId: z.uuid(),
  unitId: z.uuid(),
  versionId: z.uuid(),
  emails: z.array(z.email()).min(1).max(8),
  validDays: z.coerce.number().int().min(1).max(30),
  authority: checkbox,
});
const applicationIssueSchema = issueSchema.omit({ unitId: true, emails: true }).extend({
  applicationId: z.uuid(),
  setupId: z.uuid(),
  applicationVersion: z.coerce.number().int().positive(),
  setupRevision: z.coerce.number().int().positive(),
  termsConfirmed: checkbox,
});

function actionError(message: string): ActionState {
  return { status: "error", message };
}

function agreementError(code: string | undefined): ActionState {
  switch (code) {
    case "MFA_REQUIRED": return actionError("Verify with your authenticator, then try again.");
    case "AGREEMENT_SIGNERS_UNAVAILABLE": return actionError("Each renter needs a separate verified Crecy account. Check the addresses with the renters before trying again.");
    case "AGREEMENT_SOURCE_CHANGED":
    case "AGREEMENT_SOURCE_UNAVAILABLE": return actionError("The agreement PDF is unavailable or changed. Check the exact version before continuing.");
    case "AGREEMENT_DISCLOSURE_CHANGED": return actionError("The electronic-signature disclosure changed. Reload and review it before signing.");
    case "AGREEMENT_NOT_OPEN": return actionError("The agreement has closed. Refresh to see its current status.");
    case "AGREEMENT_INVITATION_NOT_OPEN": return actionError("The renter has signed or the invitation has expired. Refresh to see its current status.");
    case "AGREEMENT_INVITATION_IN_FLIGHT": return actionError("Delivery is in progress. Wait for the email status to update before resending.");
    case "AGREEMENT_INVITATION_RESEND_COOLDOWN": return actionError("Wait five minutes after the last invitation before sending another.");
    case "AGREEMENT_INVITATION_RESEND_LIMIT": return actionError("The resend limit for this signing request has been reached.");
    case "AGREEMENT_LANDLORD_UNAVAILABLE": return actionError("The issuing landlord no longer has authority in this workspace.");
    case "AGREEMENT_ISSUE_FORBIDDEN": return actionError("Only an authorized workspace owner with a verified account can issue an agreement.");
    case "APPLICATION_SIGNING_SETUP_UNAVAILABLE":
    case "APPLICATION_SIGNING_SETUP_CHANGED": return actionError("The prepared application changed. Return to the rental application to reopen the signing form.");
    case "APPLICATION_AGREEMENT_TERMS_INVALID": return actionError("Complete the future lease dates, rent, first charge, and responsible renter in lease setup before sending.");
    case "APPLICATION_AGREEMENT_TERM_UNAVAILABLE": return actionError("Another tenancy overlaps these lease dates. Review the unit’s reservations before sending.");
    case "APPLICATION_AGREEMENT_TERMS_LOCKED": return actionError("The approved lease terms changed. Return to the linked application before continuing.");
    case "APPLICANT_EVIDENCE_REVIEW_REQUIRED": return actionError("Complete the landlord review of the applicant’s current submission before sending an agreement.");
    case "APPLICATION_AGREEMENT_ALREADY_OPEN": return actionError("This application already has a signing request. Reopen it from the application.");
    case "IDEMPOTENCY_CONFLICT": return actionError("A different request already used this form. Reload and check the agreement before retrying.");
    default: return actionError("The agreement could not be updated. Verify access and try again.");
  }
}

function refreshAgreement(agreementId: string) {
  for (const base of ["/app/agreements", "/documents/agreements"]) {
    revalidatePath(base);
    revalidatePath(base + "/" + agreementId);
  }
}

function finishIssue(data: unknown, expectedAgreementId: string, applicationLinked = false): ActionState {
  const issued = issuedAgreementSchema.safeParse(data);
  if (!issued.success || issued.data.agreementId !== expectedAgreementId) {
    return actionError("The signing request could not be confirmed. Retry the same request.");
  }
  if (applicationLinked && issued.data.status === "open") scheduleCriticalRentalMail("agreement", expectedAgreementId);
  refreshAgreement(issued.data.agreementId);
  redirect("/app/agreements/" + issued.data.agreementId);
}

export async function issueAgreementAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const emails = form.get("emails");
  const input = issueSchema.safeParse({
    organizationId: form.get("organizationId"),
    agreementId: form.get("agreementId"),
    unitId: form.get("unitId"),
    versionId: form.get("versionId"),
    emails: typeof emails === "string" && emails.length <= 2200 ? emails.split(/[\n,]+/).map((email) => email.trim().toLowerCase()).filter(Boolean) : [],
    validDays: form.get("validDays"),
    authority: form.get("authority"),
  });
  if (!input.success || new Set(input.data.emails).size !== input.data.emails.length) {
    return actionError("Choose a rental and PDF version, enter one to eight distinct renter email addresses, and confirm your authority.");
  }
  if (!resolveEsignConsent()) return actionError("The electronic-signature disclosure is unavailable.");

  const request = input.data;
  const session = await getAgreementSession("operator");
  if (session.mode !== "ready" || session.organizationId !== request.organizationId) {
    return actionError("The active workspace changed. Reopen the form in the intended workspace.");
  }
  const { data, error } = await session.supabase.rpc("issue_rental_agreement", {
    p_organization_id: session.organizationId,
    p_agreement_id: request.agreementId,
    p_unit_id: request.unitId,
    p_document_version_id: request.versionId,
    p_lessee_emails: request.emails,
    p_valid_days: request.validDays,
    p_landlord_authority_confirmed: true,
  });
  if (error) return agreementError(error.message);
  return finishIssue(data, request.agreementId);
}

export async function issueApplicationAgreementAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const input = applicationIssueSchema.safeParse({
    organizationId: form.get("organizationId"),
    agreementId: form.get("agreementId"),
    applicationId: form.get("applicationId"),
    setupId: form.get("setupId"),
    applicationVersion: form.get("applicationVersion"),
    setupRevision: form.get("setupRevision"),
    termsConfirmed: form.get("termsConfirmed"),
    versionId: form.get("versionId"),
    validDays: form.get("validDays"),
    authority: form.get("authority"),
  });
  if (!input.success) return actionError("Choose the exact PDF version and confirm your authority for this application.");
  if (!resolveEsignConsent()) return actionError("The electronic-signature disclosure is unavailable.");

  const request = input.data;
  const session = await getAgreementSession("operator");
  if (session.mode !== "ready" || session.organizationId !== request.organizationId) {
    return actionError("The active workspace changed. Reopen the form in the intended workspace.");
  }
  const { data, error } = await session.supabase.rpc("send_rental_application_agreement", {
    p_organization_id: session.organizationId,
    p_agreement_id: request.agreementId,
    p_application_id: request.applicationId,
    p_setup_id: request.setupId,
    p_expected_application_version: request.applicationVersion,
    p_expected_setup_revision: request.setupRevision,
    p_document_version_id: request.versionId,
    p_valid_days: request.validDays,
    p_landlord_authority_confirmed: true,
    p_terms_confirmed: true,
  });
  return error ? agreementError(error.message) : finishIssue(data, request.agreementId, true);
}

const resendInvitationSchema = z.object({
  agreementId: z.uuid(),
  organizationId: z.uuid(),
  operationId: z.uuid(),
  confirmed: checkbox,
});
const resendInvitationReceiptSchema = z.object({
  agreementId: z.uuid(),
  notificationJobId: z.uuid(),
  replayed: z.boolean(),
});

export async function resendAgreementInvitationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const input = resendInvitationSchema.safeParse({
    agreementId: form.get("agreementId"),
    organizationId: form.get("organizationId"),
    operationId: form.get("operationId"),
    confirmed: form.get("confirmed"),
  });
  if (!input.success) return actionError("Confirm you want to send a fresh invitation to the verified application email.");
  const request = input.data;
  const session = await getAgreementSession("operator");
  if (session.mode !== "ready" || session.organizationId !== request.organizationId) {
    return actionError("The active workspace changed. Reopen the agreement in the intended workspace.");
  }
  try {
    const { data, error } = await session.supabase.rpc("resend_rental_agreement_invitation", {
      p_organization_id: session.organizationId, p_agreement_id: request.agreementId, p_operation_id: request.operationId,
    });
    if (error) return agreementError(error.message);
    const receipt = resendInvitationReceiptSchema.safeParse(data);
    if (!receipt.success || receipt.data.agreementId !== request.agreementId) {
      return actionError("The resend could not be confirmed. Retry without closing this page.");
    }
    if (!receipt.data.replayed) scheduleCriticalRentalMail("job", receipt.data.notificationJobId);
    refreshAgreement(request.agreementId);
    return { status: "success", message: "A fresh signing invitation was queued for the verified application email." };
  } catch {
    return actionError("The resend could not be confirmed. Retry without closing this page.");
  }
}

const signSchema = signDocumentSchema.omit({ organizationId: true }).extend({
  surface: surfaceSchema,
  agreementId: z.uuid(),
  organizationId: z.uuid().nullable(),
});

export async function signAgreementAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const input = signSchema.safeParse({
    surface: form.get("surface"),
    agreementId: form.get("agreementId"),
    organizationId: form.get("organizationId") || null,
    signerName: form.get("signerName"),
    reviewedVersionId: form.get("versionId"),
    reviewedSha256: form.get("sha256"),
    esignConsentVersion: form.get("consentVersion"),
    documentReviewConfirmed: form.get("reviewed") === "on",
    esignConsentAgreed: form.get("consented") === "on",
    intentAffirmed: form.get("intent") === "on",
  });
  if (!input.success) return actionError("Review the agreement and the disclosure, type your name, and confirm all three boxes.");

  const request = input.data;
  if (resolveEsignConsent()?.version !== request.esignConsentVersion) return agreementError("AGREEMENT_DISCLOSURE_CHANGED");
  const session = await getAgreementSession(request.surface);
  if (session.mode !== "ready" || session.organizationId !== request.organizationId) return actionError("Reopen this agreement from your current session.");
  const agreement = await getRentalAgreement(request.surface, request.agreementId);
  if (agreement.mode !== "ready" || agreement.organizationId !== session.organizationId || !agreement.agreement.myCapacity) {
    return actionError("This verified account is not named as a signer on this agreement.");
  }
  if (agreement.agreement.myCapacity === "landlord") {
    const assurance = await session.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== "aal2") return agreementError("MFA_REQUIRED");
  }

  try {
    const { data, error } = await createAdminClient().rpc("sign_rental_agreement", {
      p_verified_actor_id: session.user.id,
      p_agreement_id: request.agreementId,
      p_source_version_id: request.reviewedVersionId,
      p_source_sha256: request.reviewedSha256,
      p_signed_name: request.signerName,
      p_consent_version: request.esignConsentVersion,
      p_agreed: true,
      p_intent_confirmed: true,
    });
    if (error) return agreementError(error.message);
    const receipt = signedAgreementReceiptSchema.safeParse(data);
    if (!receipt.success || receipt.data.agreementId !== request.agreementId
      || receipt.data.sourceVersionId !== request.reviewedVersionId || receipt.data.actorId !== session.user.id
      || receipt.data.capacity !== agreement.agreement.myCapacity
      || (!receipt.data.replayed && receipt.data.status !== "open" && receipt.data.status !== "executed")) {
      return actionError("The signature could not be confirmed. Retry without changing your typed name.");
    }
  } catch {
    return actionError("Signing is temporarily unavailable. Reopen the agreement before trying again.");
  }
  refreshAgreement(request.agreementId);
  return { status: "success", message: "Your signature was saved." };
}

const closeSchema = z.object({
  action: z.enum(["void", "declined"]),
  agreementId: z.uuid(),
  organizationId: z.uuid().nullable(),
  confirmed: checkbox,
});

export async function closeAgreementAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const input = closeSchema.safeParse({
    action: form.get("closeAction"),
    agreementId: form.get("agreementId"),
    organizationId: form.get("organizationId") || null,
    confirmed: form.get("confirmed"),
  });
  if (!input.success) return actionError("Confirm that you want to end this signing request.");
  const request = input.data;
  const session = await getAgreementSession(request.action === "void" ? "operator" : "participant");
  if (session.mode !== "ready" || session.organizationId !== request.organizationId) return actionError("Reopen this agreement from your current session.");
  const { error } = await session.supabase.rpc("close_pending_rental_agreement", {
    p_agreement_id: request.agreementId,
    p_action: request.action,
    p_organization_id: session.organizationId,
  });
  if (error) return agreementError(error.message);
  refreshAgreement(request.agreementId);
  return { status: "success", message: request.action === "void" ? "The signing request was voided." : "You declined the signing request." };
}
