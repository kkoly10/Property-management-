import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const bindings = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAssurance: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: bindings.getUser, mfa: { getAuthenticatorAssuranceLevel: bindings.getAssurance } },
    rpc: bindings.rpc,
  }),
}));
vi.mock("@/lib/organization/context", () => ({ getActiveOrganizationId: bindings.getActiveOrganizationId }));

const workspace = "20000000-0000-4000-8000-000000000002";
const otherWorkspace = "20000000-0000-4000-8000-000000000003";
const property = "20000000-0000-4000-8000-000000000004";
const book = "20000000-0000-4000-8000-000000000005";
const payment = {
  paymentId: "20000000-0000-4000-8000-000000000006",
  publicReference: 'REF-"6"',
  activityAt: "2026-11-21T16:00:00Z",
  receivedAt: null,
  propertyId: property,
  propertyName: "  =SUM(1,2)",
  accountingBookId: book,
  unitCode: "12, A",
  householdName: "Lee\nSample",
  paymentSource: "cash",
  status: "succeeded",
  reconciliationStatus: "unreconciled",
  amountMinor: "9007199254740993",
  allocatedMinor: "100",
  currencyCode: "USD",
};

function request(query = "organizationId=" + workspace) {
  return new Request("https://app.crecyos.com/api/v1/payments/export?" + query);
}

beforeEach(() => {
  vi.resetAllMocks();
  bindings.getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  bindings.getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  bindings.getActiveOrganizationId.mockResolvedValue(workspace);
  bindings.rpc.mockResolvedValue({
    data: {
      scope: { organizationId: workspace, fromDate: "2026-11-01", toDate: "2026-11-21" },
      rowCount: 1,
      items: [payment],
    },
    error: null,
  });
});

describe("operator payment CSV", () => {
  it("uses the explicit selected workspace, retains filter values, and serializes finance rows safely", async () => {
    const result = await GET(request("organizationId=" + workspace + "&from=2026-11-01&to=2026-11-21&propertyId=" + property + "&accountingBookId=" + book));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("content-disposition")).toBe('attachment; filename="crecy-payments-2026-11-01-to-2026-11-21.csv"');
    expect(bindings.rpc).toHaveBeenCalledWith("get_operator_payment_export_for_organization", {
      p_organization_id: workspace, p_from_date: "2026-11-01", p_to_date: "2026-11-21",
      p_property_id: property, p_accounting_book_id: book,
    });
    const csv = await result.text();
    expect(csv).toContain('"12, A"');
    expect(csv).toContain('"REF-""6"""');
    expect(csv).toContain('"Lee\nSample"');
    expect(csv).toContain("\"'  =SUM(1,2)\"");
    expect(csv).toContain(",9007199254740993,100,");
  });

  it("treats empty optional form fields as defaults selected by the database", async () => {
    expect((await GET(request("organizationId=" + workspace + "&from=&to=&propertyId=&accountingBookId="))).status).toBe(200);
    expect(bindings.rpc).toHaveBeenCalledWith("get_operator_payment_export_for_organization", {
      p_organization_id: workspace, p_from_date: null, p_to_date: null, p_property_id: null, p_accounting_book_id: null,
    });
  });

  it("refuses a stale export link after switching workspaces", async () => {
    bindings.getActiveOrganizationId.mockResolvedValue(otherWorkspace);
    expect((await GET(request())).status).toBe(409);
    expect(bindings.rpc).not.toHaveBeenCalled();
  });

  it("requires an authenticated session and MFA", async () => {
    bindings.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET(request())).status).toBe(401);
    bindings.getAssurance.mockResolvedValueOnce({ data: { currentLevel: "aal1" }, error: null });
    const result = await GET(request());
    expect(result.status).toBe(303);
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/settings/security/mfa");
    expect(location.searchParams.get("returnTo")).toBe("/api/v1/payments/export?organizationId=" + workspace);
    expect(bindings.rpc).not.toHaveBeenCalled();
  });

  it("rejects duplicate or impossible filters", async () => {
    expect((await GET(request("organizationId=" + workspace + "&organizationId=" + otherWorkspace))).status).toBe(400);
    expect((await GET(request("organizationId=" + workspace + "&from=2026-02-31"))).status).toBe(400);
    expect(bindings.rpc).not.toHaveBeenCalled();
  });

  it("fails closed if the returned scope does not match", async () => {
    bindings.rpc.mockResolvedValueOnce({
      data: { scope: { organizationId: otherWorkspace, fromDate: "2026-11-01", toDate: "2026-11-21" }, items: [], rowCount: 0 },
      error: null,
    });
    expect((await GET(request())).status).toBe(503);
  });

  it("preserves scope and row-limit errors", async () => {
    bindings.rpc.mockResolvedValueOnce({ data: null, error: { message: "BOOK_SCOPE_DENIED" } });
    expect((await GET(request())).status).toBe(403);
    bindings.rpc.mockResolvedValueOnce({ data: null, error: { message: "PAYMENT_EXPORT_TOO_LARGE" } });
    expect((await GET(request())).status).toBe(422);
  });
});
