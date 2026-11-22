import "server-only";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";

const count = z.number().int().nonnegative();
const readinessSchema = z.object({
  organizationId: z.uuid(),
  organizationStatus: z.enum(["trial", "active", "suspended", "closing", "closed"]),
  checkedAt: z.iso.datetime({ offset: true }),
  counts: z.object({
    occupiedTenancies: count, scheduledTenancies: count, pendingAgreements: count, pendingDocumentSignatures: count,
    residentLedgerPositions: count, openCharges: count, pendingPayments: count, unreconciledProviderPayments: count, pendingRefunds: count,
    openDisputes: count, pendingSettlements: count, reconciliationExceptions: count, unresolvedDepositTenancies: count,
    openWorkOrders: count, pendingOwnerApprovals: count, ownerLedgerPositions: count,
    openPrivacyRequests: count, privacyCasesWithHolds: count,
  }),
});

export type ClosureCounts = z.infer<typeof readinessSchema>["counts"];

const savedClosureAction = z.object({
  caseId: z.uuid(),
  caseVersion: z.number().int().positive(),
  status: z.enum(["requested", "reviewed", "canceled"]),
});
const closureReviewSchema = z.object({
  organizationId: z.uuid(),
  case: savedClosureAction.extend({
    recordedAt: z.iso.datetime({ offset: true }),
    reviewedReadiness: z.object({
      caseVersion: z.number().int().positive(),
      readiness: readinessSchema,
    }).nullable(),
  }).nullable(),
});
const closureActionInput = z.object({
  organizationId: z.uuid(),
  caseId: z.union([z.uuid(), z.literal("")]),
  caseVersion: z.string().regex(/^(?:0|[1-9][0-9]{0,8})$/).transform(Number),
  action: z.enum(["request", "review", "cancel"]),
  idempotencyKey: z.uuid(),
});
export type WorkspaceClosureReview = z.infer<typeof closureReviewSchema>;

async function readWorkspaceClosureReview(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string) {
  try {
    const result = await supabase.rpc("get_workspace_closure_review", { p_organization_id: organizationId });
    if (result.error?.message === "WORKSPACE_OWNER_REQUIRED") return {};
    const review = closureReviewSchema.safeParse(result.data);
    if (result.error || !review.success || review.data.organizationId !== organizationId) return { reviewUnavailable: true };
    const snapshot = review.data.case?.reviewedReadiness;
    if (snapshot && snapshot.readiness.organizationId !== organizationId) return { reviewUnavailable: true };
    return { review: review.data };
  } catch {
    return { reviewUnavailable: true };
  }
}

export async function getOrganizationClosureReadiness() {
  const context = await getOrganizationContext();
  if (context.state === "setup" || context.state === "error") return { state: "unavailable" } as const;
  if (context.state !== "active") return { state: "workspace_required" } as const;
  const { active } = context;

  try {
    const supabase = await createClient();
    const { data: session, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !session.user) return { state: "sign_in_required" } as const;
    const result = await supabase.rpc("get_organization_closure_readiness", { p_organization_id: active.organizationId });
    if (result.error?.message === "MFA_REQUIRED") return { state: "mfa_required", workspaceName: active.displayName } as const;
    if (result.error?.message === "ORGANIZATION_SCOPE_DENIED") return { state: "forbidden" } as const;
    const readiness = readinessSchema.safeParse(result.data);
    if (result.error || !readiness.success || readiness.data.organizationId !== active.organizationId) {
      return { state: "unavailable" } as const;
    }
    const ownerReview = active.roleCode === "org_owner" ? await readWorkspaceClosureReview(supabase, active.organizationId) : {};
    return { state: "ready", workspaceName: active.displayName, readiness: readiness.data, ...ownerReview } as const;
  } catch {
    return { state: "unavailable" } as const;
  }
}

export async function recordWorkspaceClosureAction(form: FormData) {
  const input = closureActionInput.safeParse({
    organizationId: form.get("organizationId"), caseId: form.get("caseId"), caseVersion: form.get("caseVersion"),
    action: form.get("closureAction"), idempotencyKey: form.get("idempotencyKey"),
  });
  if (!input.success) return "invalid";
  const request = input.data;
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== request.organizationId) return "changed";

  try {
    const supabase = await createClient();
    const { data: session, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !session.user) return "forbidden";
    const result = await supabase.rpc("record_workspace_closure_action", {
      p_organization_id: context.active.organizationId,
      p_expected_case_id: request.caseId || null,
      p_expected_case_version: request.caseVersion,
      p_action: request.action,
      p_idempotency_key: request.idempotencyKey,
    });
    if (result.error) {
      switch (result.error.message) {
        case "MFA_REQUIRED": return "mfa";
        case "WORKSPACE_OWNER_REQUIRED":
        case "ORGANIZATION_SCOPE_DENIED": return "forbidden";
        case "CLOSURE_VERSION_CONFLICT":
        case "CLOSURE_REVIEW_ALREADY_ACTIVE_OR_UNAVAILABLE":
        case "CLOSURE_REVIEW_NOT_ACTIVE":
        case "IDEMPOTENCY_CONFLICT": return "changed";
        default: return "unavailable";
      }
    }
    return savedClosureAction.safeParse(result.data).success ? "saved" : "unavailable";
  } catch {
    return "unavailable";
  }
}
