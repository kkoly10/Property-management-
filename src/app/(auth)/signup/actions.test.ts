import { beforeEach, describe, expect, it, vi } from "vitest";

const GOOD_HASH = "abcdef0123456789abcdef0123456789";
const generateLink = vi.fn();
const deleteUser = vi.fn();
const rpc = vi.fn();
const sendViaResend = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink, deleteUser } },
    rpc,
  }),
}));
vi.mock("@/lib/notifications/resend", () => ({ sendViaResend }));
vi.mock("@/lib/runtime/host", () => ({ originForAudience: () => "https://app.crecyos.com" }));
vi.mock("@/lib/notifications/sender", () => ({
  senderFor: () => ({
    from: "Crecy <notifications@mail.crecyos.com>",
    replyTo: null,
    audience: "operator",
    unsubscribable: false,
  }),
}));
vi.mock("@/lib/notifications/html-email", () => ({ renderEmailHtml: () => "<html>signup</html>" }));
vi.mock("@/lib/notifications/auth-email", () => ({
  renderAuthEmail: ({ confirmUrl }: { confirmUrl: string }) => ({
    subject: "Confirm your email address",
    body: `Confirm: ${confirmUrl}`,
    preheader: "Confirm your account",
    paragraphs: ["Confirm your account"],
    heading: "Confirm your email address",
    ctaLabel: "Confirm my email",
    ctaUrl: confirmUrl,
    securityNote: "Ignore this message if you did not sign up.",
    language: "en",
  }),
}));

const { signupAction } = await import("./actions");

function form(email = "new@example.com", password = "a-secure-password-123") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

beforeEach(() => {
  generateLink.mockReset();
  deleteUser.mockReset();
  rpc.mockReset();
  sendViaResend.mockReset();
  redirect.mockClear();
  deleteUser.mockResolvedValue({ data: null, error: null });
  rpc.mockResolvedValue({ data: { allowed: true }, error: null });
  sendViaResend.mockResolvedValue({ ok: true, messageId: "msg_123" });
});

describe("signup activation", () => {
  it("claims the public signup throttle before creating an auth user", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-123" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });

    await expect(signupAction({ status: "idle" }, form())).rejects.toThrow("REDIRECT:/signup?check_email=1");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("claim_public_signup_attempt");
    expect(rpc.mock.calls[0][1].p_email_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rpc.mock.calls[0][1].p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(generateLink.mock.invocationCallOrder[0]);
  });

  it("stops a throttled request before auth creation or email delivery", async () => {
    rpc.mockResolvedValue({ data: { allowed: false }, error: null });

    const result = await signupAction({ status: "idle" }, form());

    expect(result.status).toBe("error");
    expect(result.message).toContain("Too many signup attempts");
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendViaResend).not.toHaveBeenCalled();
  });

  it("creates a custom-email signup and sends a Crecy confirmation link to onboarding", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-123" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });

    await expect(signupAction({ status: "idle" }, form())).rejects.toThrow("REDIRECT:/signup?check_email=1");

    expect(generateLink).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      password: "a-secure-password-123",
    });
    expect(sendViaResend).toHaveBeenCalledTimes(1);
    const message = sendViaResend.mock.calls[0][0];
    const body = String(message.text);
    expect(body).toContain("https://app.crecyos.com/auth/confirm?");
    expect(body).toContain(`token_hash=${GOOD_HASH}`);
    expect(body).toContain("type=signup");
    expect(body).toContain("next=%2Fonboarding%2Forganization");
    expect(message.idempotencyKey).toBe("signup-user-123");
  });

  it("gives an existing account the same neutral completion state without sending another signup email", async () => {
    generateLink.mockResolvedValue({
      data: null,
      error: { code: "user_already_exists", message: "User already registered" },
    });

    await expect(signupAction({ status: "idle" }, form("existing@example.com"))).rejects.toThrow(
      "REDIRECT:/signup?check_email=1",
    );

    expect(sendViaResend).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("retries a transient provider failure with the same idempotent message", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-retry" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });
    sendViaResend
      .mockResolvedValueOnce({ ok: false, code: "MAIL_PROVIDER_UNREACHABLE", detail: "timeout", retryable: true })
      .mockResolvedValueOnce({ ok: true, messageId: "msg_retry" });

    await expect(signupAction({ status: "idle" }, form())).rejects.toThrow("REDIRECT:/signup?check_email=1");

    expect(sendViaResend).toHaveBeenCalledTimes(2);
    expect(sendViaResend.mock.calls[0][0].idempotencyKey).toBe("signup-user-retry");
    expect(sendViaResend.mock.calls[1][0].idempotencyKey).toBe("signup-user-retry");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("does not promise an email when provider delivery definitively fails", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-fail" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });
    sendViaResend.mockResolvedValue({
      ok: false,
      code: "MAIL_PROVIDER_REJECTED",
      detail: "bad destination",
      retryable: false,
    });

    const result = await signupAction({ status: "idle" }, form());

    expect(result.status).toBe("error");
    expect(result.message).toContain("could not send");
    expect(deleteUser).toHaveBeenCalledWith("user-fail");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("never sends a malformed Supabase credential", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-bad-hash" }, properties: { hashed_token: "short" } },
      error: null,
    });

    const result = await signupAction({ status: "idle" }, form());

    expect(result.status).toBe("error");
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
