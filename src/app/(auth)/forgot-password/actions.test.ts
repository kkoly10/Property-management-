import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  cookieValues: new Map<string, string>(),
  setCookie: vi.fn(),
  generateLink: vi.fn(),
  rpc: vi.fn(),
  sendLink: vi.fn(),
  createEphemeralClient: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.requestHeaders,
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieValues.get(name);
      return value ? { value } : undefined;
    },
    set: mocks.setCookie,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createEphemeralClient }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, auth: { admin: { generateLink: mocks.generateLink } } }),
}));
vi.mock("@/lib/auth/send-auth-link", () => ({ sendAuthLink: mocks.sendLink }));

import { passwordRecoveryUrl, PASSWORD_RECOVERY_COOKIES } from "@/lib/auth/password-recovery";
import { requestPasswordRecovery, resetPassword } from "./actions";

const HASH = "f".repeat(64);
const FLOW = "b330d7b4-6619-4d41-803d-4a68167c65d5";
const IDLE = { status: "idle" } as const;
const PASSWORD = "fixture-password-368";

function requestForm(email: string) {
  const form = new FormData();
  form.set("email", email);
  return form;
}

function resetForm(flowId = FLOW, confirmPassword = PASSWORD) {
  const data = new FormData();
  data.set("flowId", flowId);
  data.set("password", PASSWORD);
  data.set("confirmPassword", confirmPassword);
  return data;
}

function setRecoveryFixture() {
  const proof = passwordRecoveryUrl("https://app.crecyos.com", HASH).searchParams.get("recovery_proof");
  mocks.cookieValues.set(PASSWORD_RECOVERY_COOKIES[0], `${FLOW}.${HASH}.${proof}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRECY_PASSWORD_RECOVERY_SECRET", "local-test-purpose-bound-proof");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-publishable-test-key");
  mocks.requestHeaders = new Headers({ host: "owner.crecyos.com", "x-forwarded-for": "203.0.113.20" });
  mocks.cookieValues.clear();
  mocks.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
  mocks.generateLink.mockResolvedValue({ error: null, data: { user: { id: "fixture" }, properties: { hashed_token: HASH } } });
  mocks.verifyOtp.mockResolvedValue({ error: null, data: { user: { id: "verified-fixture" }, session: {} } });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createEphemeralClient.mockReturnValue({
    auth: { verifyOtp: mocks.verifyOtp, updateUser: mocks.updateUser, signOut: mocks.signOut },
  });
  mocks.redirect.mockImplementation(path => { throw new Error(`REDIRECT:${path}`); });
});
afterEach(() => vi.unstubAllEnvs());

describe("requestPasswordRecovery", () => {
  it("shares the sign-in throttle and uses a recognized audience", async () => {
    const result = await requestPasswordRecovery(IDLE, requestForm("Fixture@Example.com"));
    expect(mocks.rpc).toHaveBeenCalledWith("claim_public_signin_link_attempt", {
      p_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "fixture@example.com" });
    expect(mocks.sendLink).toHaveBeenCalledWith({
      actionType: "recovery", audience: "owner", email: "fixture@example.com", tokenHash: HASH,
    });
    expect(result.status).toBe("success");
  });

  it("keeps unknown, throttled and mail failure outcomes neutral", async () => {
    mocks.generateLink.mockResolvedValueOnce({ data: null, error: { code: "user_not_found" } });
    const unknown = await requestPasswordRecovery(IDLE, requestForm("fixture@example.com"));
    expect(mocks.sendLink).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    const limited = await requestPasswordRecovery(IDLE, requestForm("fixture@example.com"));
    expect(mocks.generateLink).toHaveBeenCalledTimes(1);
    mocks.sendLink.mockRejectedValueOnce(new Error("simulated missing acknowledgement"));
    const unavailable = await requestPasswordRecovery(IDLE, requestForm("fixture@example.com"));
    expect(unknown).toEqual(limited);
    expect(limited).toEqual(unavailable);
  });

  it("refuses to mint credentials on an unknown host", async () => {
    mocks.requestHeaders = new Headers({ host: "unrecognized.example.invalid" });
    expect((await requestPasswordRecovery(IDLE, requestForm("fixture@example.com"))).status).toBe("success");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  it("binds the form to the same recovery link and verifies before updating through an ephemeral client", async () => {
    setRecoveryFixture();
    await expect(resetPassword(IDLE, resetForm())).rejects.toThrow("REDIRECT:/login?password_reset=1");
    expect(mocks.createEphemeralClient).toHaveBeenCalledWith("https://fixture.supabase.co", "local-publishable-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(mocks.setCookie).toHaveBeenCalledWith("__Host-crecy-recovery", "", expect.objectContaining({ maxAge: 0, path: "/", secure: true }));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: HASH });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: PASSWORD });
    expect(mocks.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("validates the password confirmation and refuses a superseded form before consuming the token", async () => {
    setRecoveryFixture();
    expect((await resetPassword(IDLE, resetForm(FLOW, "different-fixture-text"))).fieldErrors?.confirmPassword).toBeDefined();
    const superseded = await resetPassword(IDLE, resetForm("d42e023d-622d-439c-8e3e-c40d170a6228"));
    expect(superseded.status).toBe("error");
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("does not change a password if the provider rejects an expired or used credential", async () => {
    setRecoveryFixture();
    mocks.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired" }, data: {} });
    expect((await resetPassword(IDLE, resetForm())).message).toContain("Request a new link");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reports that a password was saved without claiming other sessions ended on provider failure", async () => {
    setRecoveryFixture();
    mocks.signOut.mockRejectedValueOnce(new Error("simulated outage"));
    await expect(resetPassword(IDLE, resetForm())).rejects.toThrow("REDIRECT:/login?password_reset=1&session_notice=1");
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });
});
