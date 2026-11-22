import { beforeEach, expect, it, vi } from "vitest";
import { getOrganizationClosureReadiness } from "./organization-closure";
import { routeForHost } from "@/lib/runtime/host-routing";

const bindings = vi.hoisted(() => ({ context: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/organization/context", () => ({ getOrganizationContext: bindings.context }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: bindings.getUser }, rpc: bindings.rpc }),
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganization = "10000000-0000-4000-8000-000000000002";
const counts = {
  occupiedTenancies: 1, scheduledTenancies: 2, pendingAgreements: 0, pendingDocumentSignatures: 0,
  residentLedgerPositions: 2, openCharges: 1, pendingPayments: 1, unreconciledProviderPayments: 0,
  pendingRefunds: 0, openDisputes: 0, pendingSettlements: 0, reconciliationExceptions: 0, unresolvedDepositTenancies: 1,
  openWorkOrders: 0, pendingOwnerApprovals: 0, ownerLedgerPositions: 1, openPrivacyRequests: 1, privacyCasesWithHolds: 1,
};
const receipt = { organizationId, organizationStatus: "closing", checkedAt: "2026-11-22T15:14:12.184+00:00", counts };

beforeEach(() => {
  vi.resetAllMocks();
  bindings.context.mockResolvedValue({ state: "active", active: { organizationId, displayName: "Selected company" } });
  bindings.getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  bindings.rpc.mockResolvedValue({ data: receipt, error: null });
});

it("uses the selected workspace and returns the same sanitized counts in a closing workspace", async () => {
  bindings.rpc.mockResolvedValueOnce({
    data: { ...receipt, internalReference: "never rendered", counts: { ...counts, claimant: "never rendered" } },
    error: null,
  });
  expect(await getOrganizationClosureReadiness()).toEqual({ state: "ready", workspaceName: "Selected company", readiness: receipt });
  expect(bindings.rpc).toHaveBeenCalledWith("get_organization_closure_readiness", { p_organization_id: organizationId });
});

it("does not request counts without a selected workspace or real session", async () => {
  bindings.context.mockResolvedValueOnce({ state: "revoked" });
  expect((await getOrganizationClosureReadiness()).state).toBe("workspace_required");
  bindings.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  expect((await getOrganizationClosureReadiness()).state).toBe("sign_in_required");
  expect(bindings.rpc).not.toHaveBeenCalled();
});

it("shows MFA and scope errors as distinct states without counts", async () => {
  bindings.rpc.mockResolvedValueOnce({ error: { message: "MFA_REQUIRED" } });
  expect(await getOrganizationClosureReadiness()).toEqual({ state: "mfa_required", workspaceName: "Selected company" });
  bindings.rpc.mockResolvedValueOnce({ error: { message: "ORGANIZATION_SCOPE_DENIED" } });
  expect(await getOrganizationClosureReadiness()).toEqual({ state: "forbidden" });
});

it("fails closed for a mismatched workspace or missing count", async () => {
  bindings.rpc.mockResolvedValueOnce({ data: { ...receipt, organizationId: otherOrganization }, error: null });
  expect((await getOrganizationClosureReadiness()).state).toBe("unavailable");
  bindings.rpc.mockResolvedValueOnce({ data: { ...receipt, counts: {} }, error: null });
  expect((await getOrganizationClosureReadiness()).state).toBe("unavailable");
});

it("serves closure readiness on the operator and development hosts", () => {
  expect(routeForHost("app.crecyos.com", "/settings/organization-closure").type).toBe("continue");
  expect(routeForHost("localhost:3000", "/settings/organization-closure").type).toBe("continue");
  expect(routeForHost("owner.crecyos.com", "/settings/organization-closure").type).toBe("reject");
});
