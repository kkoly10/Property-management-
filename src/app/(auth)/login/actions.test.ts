import { beforeEach, describe, expect, it, vi } from "vitest";

const GOOD_HASH = "abcdef0123456789abcdef0123456789";
const generateLink = vi.fn();
const rpc = vi.fn();
const sendViaResend = vi.fn();
let requestHeaders = new Headers({
  host: "app.crecyos.com",
  "x-forwarded-host": "app.crecyos.com",
  "x-forwarded-proto": "https",
  "x-forwarded-for": "203.0.113.20",
});

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink } },
    rpc,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: vi.fn() } }),
}));
vi.mock("@/lib/notifications/resend", () => ({ sendViaResend }));
vi.mock("@/lib/notifications/sender", () => ({
  senderFor: (_code: string, audience: string) => ({
    from: audience === "resident"
      ? "Crecy Living <notifications@mail.crecyliving.com>"
      : audience === "owner"
        ? "Crecy Owner <notifications@mail.crecyos.com>"
        : "Crecy <notifications@mail.crecyos.com>",
    replyTo: null,
    audience,
    unsubscribable: false,
  }),
}));
vi.mock("@/lib/notifications/html-email", () => ({ renderEmailHtml: () => "<html>magic</html>" }));
vi.mock("@/lib/notifications/auth-email", () => ({
  renderAuthEmail: ({ confirmUrl }: { confirmUrl: string }) => ({
    subject: "Your Crecy sign-in link",
    body: `Sign in: ${confirmUrl}`,
    preheader: "Sign in to Crecy",
    paragraphs: ["Sign in to Crecy"],
    heading: "Your sign-in link",
    ctaLabel: "Sign in",
    ctaUrl: confirmUrl,
    securityNote: "Ignore this message if you did not request it.",
    language: "en",
  }),
}));

const { requestSignInLinkAction } = await import("./actions");

function form(email = "known@example.com", next = "") {
  const data = new FormData();
  data.set("email", email);
  if (next) data.set("next", next);
  return data;
}

beforeEach(() => {
  generateLink.mockReset();
  rpc.mockReset();
  sendViaResend.mockReset();
  requestHeaders = new Headers({
    host: "app.crecyos.com",
    "x-forwarded-host": "app.crecyos.com",
    "x-forwarded-proto": "https",
    "x-forwarded-for": "203.0.113.20",
  });
  rpc.mockResolvedValue({ data: { allowed: true }, error: null });
  sendViaResend.mockResolvedValue({ ok: true, messageId: "msg_123" });
});

describe("browser-independent login magic links", () => {
  it("mints a token hash and sends a Crecy /auth/confirm link instead of a Supabase PKCE callback", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-123" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });

    const result = await requestSignInLinkAction({ status: "idle" }, form());

    expect(result.status).toBe("success");
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "known@example.com" });
    expect(sendViaResend).toHaveBeenCalledTimes(1);

    const message = sendViaResend.mock.calls[0][0];
    const body = String(message.text);
    expect(body).toContain("https://app.crecyos.com/auth/confirm?");
    expect(body).toContain(`token_hash=${GOOD_HASH}`);
    expect(body).toContain("type=magiclink");
    expect(body).toContain("next=%2Fapp");
    expect(body).not.toContain("/auth/callback");
    expect(message.idempotencyKey).toMatch(/^signin-link-user-123-/);
  });

  it("preserves a validated relative next path", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-next" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });

    await requestSignInLinkAction({ status: "idle" }, form("known@example.com", "/settings/team"));

    expect(String(sendViaResend.mock.calls[0][0].text)).toContain("next=%2Fsettings%2Fteam");
  });

  it("uses the resident brand and /home default on a Living host", async () => {
    requestHeaders = new Headers({
      host: "oak.crecyliving.com",
      "x-forwarded-host": "oak.crecyliving.com",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "203.0.113.21",
    });
    generateLink.mockResolvedValue({
      data: { user: { id: "resident-1" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });

    await requestSignInLinkAction({ status: "idle" }, form("resident@example.com"));

    const message = sendViaResend.mock.calls[0][0];
    expect(message.from).toContain("Crecy Living");
    expect(String(message.text)).toContain("https://oak.crecyliving.com/auth/confirm?");
    expect(String(message.text)).toContain("next=%2Fhome");
  });

  it("keeps an unknown account indistinguishable and sends nothing", async () => {
    generateLink.mockResolvedValue({
      data: null,
      error: { code: "user_not_found", message: "User not found" },
    });

    const result = await requestSignInLinkAction({ status: "idle" }, form("unknown@example.com"));

    expect(result.status).toBe("success");
    expect(result.message).toContain("If that address has a Crecy account");
    expect(sendViaResend).not.toHaveBeenCalled();
  });

  it("stops a throttled request before generating a link while keeping the same browser response", async () => {
    rpc.mockResolvedValue({ data: { allowed: false }, error: null });

    const result = await requestSignInLinkAction({ status: "idle" }, form());

    expect(result.status).toBe("success");
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendViaResend).not.toHaveBeenCalled();
  });

  it("retries a transient provider failure with the same idempotency key", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "user-retry" }, properties: { hashed_token: GOOD_HASH } },
      error: null,
    });
    sendViaResend
      .mockResolvedValueOnce({ ok: false, code: "MAIL_PROVIDER_UNREACHABLE", detail: "timeout", retryable: true })
      .mockResolvedValueOnce({ ok: true, messageId: "msg_retry" });

    await requestSignInLinkAction({ status: "idle" }, form());

    expect(sendViaResend).toHaveBeenCalledTimes(2);
    expect(sendViaResend.mock.calls[0][0].idempotencyKey).toBe(sendViaResend.mock.calls[1][0].idempotencyKey);
  });
});
