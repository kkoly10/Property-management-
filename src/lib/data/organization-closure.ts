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
    return { state: "ready", workspaceName: active.displayName, readiness: readiness.data } as const;
  } catch {
    return { state: "unavailable" } as const;
  }
}
