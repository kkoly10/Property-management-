import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  operatorRpc: vi.fn(),
  getUser: vi.fn(),
  context: vi.fn(),
  cookieValues: new Map<string, string>(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.operatorRpc, auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/organization/context", () => ({
  getOrganizationContext: mocks.context,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieValues.get(name);
      return value ? { name, value } : undefined;
    },
  }),
}));

import { POST as verifyApplication } from "./verify/route";
import { GET as getApplicationStatus } from "./status/route";
import { POST as withdrawApplication } from "./withdraw/route";
import { POST as submitApplication } from "./route";
import { POST as prepareApplication } from "./prepare/route";
import { POST as closeApplication } from "./close/route";
import { applicationAccessCookieName } from "@/lib/rental-application-access";

const REF_A = "APP-ABCDEF123456";
const REF_B = "APP-123456ABCDEF";
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const VERIFY_TOKEN = "c".repeat(64);
const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";
const RATE_SECRET = "application-route-secret-that-is-at-least-thirty-two-characters";
const ORG = "97000000-0000-4000-8000-000000000097";
const APPLICATION = "98000000-0000-4000-8000-000000000098";
const UNIT = "99000000-0000-4000-8000-000000000099";
const SETUP = "9a000000-0000-4000-8000-00000000009a";
const OPERATION = "9b000000-0000-4000-8000-00000000009b";

function cookieName(reference: string) {
  const name = applicationAccessCookieName(reference);
  if (!name) throw new Error("Fixture reference is not canonical.");
  return name;
}

function verifyRequest(token = VERIFY_TOKEN) {
  return new Request("https://rent.crecyos.com/api/v1/rental-applications/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

function statusRequest(reference: string, extra = "") {
  return new Request(`https://rent.crecyos.com/api/v1/rental-applications/status?ref=${encodeURIComponent(reference)}${extra}`);
}

function withdrawRequest(reference: string, key = "withdraw-operation-key") {
  return new Request(`https://rent.crecyos.com/api/v1/rental-applications/withdraw?ref=${encodeURIComponent(reference)}`, {
    method: "POST",
    headers: { "idempotency-key": key },
  });
}

function submitRequest(forwarded?: string, realIp?: string) {
  return new Request("https://rent.crecyos.com/api/v1/rental-applications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "application-submit-key",
      ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
      ...(realIp ? { "x-real-ip": realIp } : {}),
    },
    body: JSON.stringify({
      publicId: PUBLIC_ID,
      firstName: "Jamie",
      lastName: "Applicant",
      email: "jamie@example.com",
      desiredMoveInOn: "2026-11-01",
      leaseTermText: "12 months",
      applicantNote: "",
      locale: "en-US",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValues.clear();
  vi.stubEnv("RENTAL_INQUIRY_RATE_LIMIT_SECRET", RATE_SECRET);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  mocks.context.mockResolvedValue({
    state: "active",
    active: { organizationId: ORG, customerPath: "self_managing" },
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("rental application verification HTTP boundary", () => {
  it("sets only the canonical application capability on first verification", async () => {
    mocks.rpc.mockResolvedValue({
      data: { verified: true, applicationReference: REF_A, accessToken: TOKEN_A },
      error: null,
    });

    const response = await verifyApplication(verifyRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      verified: true,
      accessGranted: true,
      applicationReference: REF_A,
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${cookieName(REF_A)}=${TOKEN_A}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toContain(cookieName(REF_B));
  });

  it("does not mint another capability on verification replay", async () => {
    mocks.rpc.mockResolvedValue({
      data: { verified: true, applicationReference: REF_A },
      error: null,
    });

    const response = await verifyApplication(verifyRequest());
    expect(await response.json()).toMatchObject({
      verified: true,
      accessGranted: false,
      applicationReference: REF_A,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed on a verified receipt with a noncanonical reference", async () => {
    mocks.rpc.mockResolvedValue({
      data: { verified: true, applicationReference: "bad-reference", accessToken: TOKEN_A },
      error: null,
    });

    const response = await verifyApplication(verifyRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ verified: false });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when a first-use access token is present but malformed", async () => {
    mocks.rpc.mockResolvedValue({
      data: { verified: true, applicationReference: REF_A, accessToken: "malformed" },
      error: null,
    });

    const response = await verifyApplication(verifyRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ verified: false });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("rental application status HTTP boundary", () => {
  it("reads only the capability for the requested reference", async () => {
    mocks.cookieValues.set(cookieName(REF_A), TOKEN_A);
    mocks.cookieValues.set(cookieName(REF_B), TOKEN_B);
    mocks.rpc.mockResolvedValue({
      data: { applicationReference: REF_A, status: "submitted" },
      error: null,
    });

    const response = await getApplicationStatus(statusRequest(REF_A));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_rental_application_for_access", {
      p_access_token: TOKEN_A,
    });
  });

  it("rejects duplicate references before touching the application RPC", async () => {
    mocks.cookieValues.set(cookieName(REF_A), TOKEN_A);
    const response = await getApplicationStatus(statusRequest(REF_A, `&ref=${REF_B}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a status receipt for a different application reference", async () => {
    mocks.cookieValues.set(cookieName(REF_A), TOKEN_A);
    mocks.rpc.mockResolvedValue({
      data: { applicationReference: REF_B, status: "submitted" },
      error: null,
    });

    const response = await getApplicationStatus(statusRequest(REF_A));
    expect(response.status).toBe(404);
  });
});

describe("rental application withdrawal HTTP boundary", () => {
  it("clears only the requested application cookie after an exact confirmed withdrawal", async () => {
    mocks.cookieValues.set(cookieName(REF_A), TOKEN_A);
    mocks.cookieValues.set(cookieName(REF_B), TOKEN_B);
    mocks.rpc.mockResolvedValue({
      data: { withdrawn: true, applicationReference: REF_A, status: "withdrawn", version: 3 },
      error: null,
    });

    const response = await withdrawApplication(withdrawRequest(REF_A));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("withdraw_public_rental_application", {
      p_access_token: TOKEN_A,
      p_idempotency_key: "withdraw-operation-key",
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${cookieName(REF_A)}=`);
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).not.toContain(cookieName(REF_B));
  });

  it("preserves capability after a mismatched or malformed 2xx withdrawal receipt", async () => {
    mocks.cookieValues.set(cookieName(REF_A), TOKEN_A);
    mocks.rpc.mockResolvedValue({
      data: { withdrawn: true, applicationReference: REF_B, status: "withdrawn", version: 3 },
      error: null,
    });

    const response = await withdrawApplication(withdrawRequest(REF_A));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects duplicate withdrawal references before calling the RPC", async () => {
    mocks.cookieValues.set(cookieName(REF_A), TOKEN_A);
    const request = new Request(
      `https://rent.crecyos.com/api/v1/rental-applications/withdraw?ref=${REF_A}&ref=${REF_B}`,
      { method: "POST", headers: { "idempotency-key": "withdraw-operation-key" } },
    );
    const response = await withdrawApplication(request);
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("rental application submission HTTP boundary", () => {
  it("fails closed in production without a valid edge-forwarded source, ignoring X-Real-IP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.rpc.mockResolvedValue({ data: { accepted: true }, error: null });

    const missing = await submitApplication(submitRequest(undefined, "198.51.100.44"));
    const malformed = await submitApplication(submitRequest("unknown", "198.51.100.44"));

    expect(missing.status).toBe(503);
    expect(malformed.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("hashes a valid edge-forwarded source and never passes the raw address", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.rpc.mockResolvedValue({ data: { accepted: true }, error: null });
    const source = "2001:db8::55";

    const response = await submitApplication(submitRequest(source, "198.51.100.44"));
    expect(response.status).toBe(202);
    const expected = createHmac("sha256", RATE_SECRET)
      .update(`rental-application-ip:${source}`)
      .digest("hex");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_public_rental_application",
      expect.objectContaining({ p_network_hash: expected }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain(source);
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain("198.51.100.44");
  });

  it("does not turn an incomplete RPC success envelope into accepted", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    const response = await submitApplication(submitRequest("203.0.113.8"));
    expect(response.status).toBe(503);
  });
});

function operatorRequest(path: "prepare" | "close", expectedVersion = 2) {
  return new Request(`https://app.crecyos.com/api/v1/rental-applications/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": OPERATION,
    },
    body: JSON.stringify({
      organizationId: ORG,
      applicationId: APPLICATION,
      expectedVersion,
    }),
  });
}

describe("rental application operator HTTP receipts", () => {
  it("accepts only an exact advancing lease-preparation receipt", async () => {
    mocks.operatorRpc.mockResolvedValue({
      data: {
        applicationId: APPLICATION,
        status: "lease_preparation",
        applicationVersion: 3,
        setupId: SETUP,
        unitId: UNIT,
        setupRevision: 1,
      },
      error: null,
    });

    const response = await prepareApplication(operatorRequest("prepare"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.operatorRpc).toHaveBeenCalledWith("prepare_rental_application_lease", {
      p_organization_id: ORG,
      p_application_id: APPLICATION,
      p_expected_version: 2,
      p_operation_key: OPERATION,
    });
  });

  it("fails closed on a mismatched preparation receipt", async () => {
    mocks.operatorRpc.mockResolvedValue({
      data: {
        applicationId: "aa000000-0000-4000-8000-0000000000aa",
        status: "lease_preparation",
        applicationVersion: 3,
        setupId: SETUP,
        unitId: UNIT,
        setupRevision: 1,
      },
      error: null,
    });

    const response = await prepareApplication(operatorRequest("prepare"));
    expect(response.status).toBe(502);
  });

  it("rejects a changed operator workspace before any preparation RPC", async () => {
    mocks.context.mockResolvedValue({
      state: "active",
      active: { organizationId: "ab000000-0000-4000-8000-0000000000ab", customerPath: "self_managing" },
    });

    const response = await prepareApplication(operatorRequest("prepare"));
    expect(response.status).toBe(409);
    expect(mocks.operatorRpc).not.toHaveBeenCalled();
  });

  it("keeps operator close private and scoped to the selected workspace", async () => {
    mocks.operatorRpc.mockResolvedValue({
      data: { applicationId: APPLICATION, status: "closed", version: 3 },
      error: null,
    });

    const response = await closeApplication(operatorRequest("close"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.operatorRpc).toHaveBeenCalledWith("close_rental_application", {
      p_organization_id: ORG,
      p_application_id: APPLICATION,
      p_expected_version: 2,
      p_idempotency_key: OPERATION,
    });
  });
});
