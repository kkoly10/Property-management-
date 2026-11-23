import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getUser: vi.fn(), caller: vi.fn(), service: vi.fn(), prepareAccount: vi.fn(), sendAuthLink: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: dependencies.getUser }, rpc: dependencies.caller }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: dependencies.service }) }));
vi.mock("@/lib/auth/prepare-invited-account", () => ({ prepareInvitedAccountToken: dependencies.prepareAccount }));
vi.mock("@/lib/auth/send-auth-link", () => ({ sendAuthLink: dependencies.sendAuthLink }));

import { POST } from "./route";

const id = "85000000-0000-4000-8000-000000000085";
const otherId = "85000000-0000-4000-8000-000000000086";
const email = "renter@example.test";
const token = "b".repeat(64);
const authRecipient = { email, email_confirmed_at: "2026-11-23T00:00:00Z" };

function post(body: object, host = "crecyliving.com") {
  return POST(new Request(`https://${host}/api/v1/rental-agreements/claim?surface=participant`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

describe("first-time agreement claim", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dependencies.getUser.mockResolvedValue({ data: { user: null } });
    dependencies.service.mockResolvedValue({ data: { agreementId: id, expectedEmail: email, throttled: false } });
    dependencies.prepareAccount.mockResolvedValue({ ok: true, tokenHash: "auth-otp-placeholder" });
    dependencies.caller.mockResolvedValue({ data: { agreementId: id, claimed: true, replayed: false } });
  });

  it("starts independent mailbox proof without granting a session or leaking the address", async () => {
    const response = await post({ token });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ emailRequested: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(dependencies.service).toHaveBeenCalledWith("begin_rental_application_signer_access", {
      p_token_hash: createHash("sha256").update(token).digest("hex"), p_request_email: true,
    });
    expect(dependencies.prepareAccount).toHaveBeenCalledWith(expect.anything(), email);
    expect(dependencies.sendAuthLink).toHaveBeenCalledWith({
      email, tokenHash: "auth-otp-placeholder", actionType: "magiclink", audience: "resident",
      next: `/documents/agreements/${id}/claim`,
    });
    expect(dependencies.caller).not.toHaveBeenCalled();
  });

  it("blocks the wrong origin, expired invitations, and signed-out ID-only requests", async () => {
    expect((await post({ token }, "app.crecyos.com")).status).toBe(404);
    expect(dependencies.service).not.toHaveBeenCalled();
    expect((await post({ agreementId: id })).status).toBe(404);
    dependencies.service.mockResolvedValueOnce({ data: null });
    expect((await post({ token })).status).toBe(404);
    expect(dependencies.prepareAccount).not.toHaveBeenCalled();
    expect(dependencies.caller).not.toHaveBeenCalled();
  });

  it("does not switch an existing wrong account or dispatch an OTP for it", async () => {
    dependencies.getUser.mockResolvedValue({ data: { user: { ...authRecipient, email: "other@example.test" } } });
    expect((await post({ token })).status).toBe(404);
    expect(dependencies.sendAuthLink).not.toHaveBeenCalled();
    expect(dependencies.caller).not.toHaveBeenCalled();
  });

  it("checks the exact verified-account receipt and offers retry after ambiguous success", async () => {
    dependencies.getUser.mockResolvedValue({ data: { user: authRecipient } });
    dependencies.caller.mockResolvedValueOnce({ data: { agreementId: otherId, claimed: true, replayed: false } });
    expect((await post({ agreementId: id })).status).toBe(502);
    const response = await post({ agreementId: id });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agreementId: id, claimed: true, replayed: false });
    expect(dependencies.caller).toHaveBeenCalledWith("claim_rental_application_agreement", { p_agreement_id: id });
    expect(dependencies.service).not.toHaveBeenCalled();
  });

  it("does not mint another provider credential while the invite is throttled", async () => {
    dependencies.service.mockResolvedValue({ data: { throttled: true } });
    expect((await post({ token })).status).toBe(202);
    expect(dependencies.prepareAccount).not.toHaveBeenCalled();
  });
});
