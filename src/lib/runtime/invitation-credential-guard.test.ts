import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runNotificationDispatch } from "./jobs";

/**
 * The worker must never send an invitation that promises a sign-in it cannot perform.
 *
 * An invitation queued under this architecture says, in its own copy, that opening the link signs the
 * recipient in and accepts the invitation. That sentence is only true while the auth credential is on
 * the job. Without it the link falls back to the bare acceptance path, which dead-ends for anybody not
 * already signed in — and the worker would still mark the message `sent`, so the delivery state would
 * report a usable invitation that is not one.
 *
 * An earlier version of this slice treated that as an acceptable degradation and let the two-minute
 * hold expire into a send. It is not: it recreates the exact defect the slice exists to remove. These
 * tests prove the send never happens.
 */
const RELAY = "https://relay.example.com/send";
const SECRET = "relay-secret-that-is-long-enough";
let relayCalls: string[] = [];
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

function job(payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    notificationJobId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    templateCode: "staff_invitation",
    category: null,
    locale: "en-US",
    channel: "email",
    recipientUserId: null,
    recipientAddress: "invited@example.com",
    payload,
    attempt: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

function supabaseWith(jobs: unknown[]): SupabaseClient {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "claim_notification_jobs") return { data: { jobs }, error: null };
      return { data: null, error: null };
    }),
  } as unknown as SupabaseClient;
}

function called(fn: string) {
  return rpcCalls.filter((call) => call.fn === fn);
}

beforeEach(() => {
  relayCalls = [];
  rpcCalls = [];
  vi.stubEnv("CRECY_NOTIFICATION_RELAY_URL", RELAY);
  vi.stubEnv("CRECY_NOTIFICATION_RELAY_SECRET", SECRET);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    relayCalls.push(String(url));
    return new Response(JSON.stringify({ messageId: "relay-1" }), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const DISPATCH = { channel: "email", limit: 10, workerRunId: "worker-run-0001", stallMinutes: 15 };

describe("the invitation credential guard", () => {
  it("sends nothing when a required credential is missing", async () => {
    // The case the deferral window exists for, after the window has expired: the attach never landed.
    const result = await runNotificationDispatch(supabaseWith([job({ authTokenRequired: true, invitationToken: "tok-abc_123" })]), DISPATCH);

    expect(result.ok).toBe(true);
    expect(relayCalls, "a dead-end invitation reached the mail relay").toHaveLength(0);
    expect(called("complete_notification_job"), "the job was marked sent").toHaveLength(0);

    const failures = called("fail_notification_job");
    expect(failures).toHaveLength(1);
    expect(failures[0].args.p_error_code).toBe("INVITATION_CREDENTIAL_MISSING");
    // Retryable: the honest case is a race with the service-role attach, and the next attempt finds it.
    // When it never arrives the backoff exhausts and the job dead-letters, which the operator sees as
    // "Email delivery failed" — the truth, rather than a delivered message that does not work.
    expect(failures[0].args.p_retryable).toBe(true);
  });

  it("treats a malformed credential as missing rather than mailing it", async () => {
    // A truncated or otherwise unusable hash cannot redeem at /auth/confirm, so sending it produces the
    // same dead end with an extra step. The shape checked here is the one the confirm route enforces.
    for (const authTokenHash of ["short", "a".repeat(513), "has spaces in it 0123", "with.a.dot0123456789", ""]) {
      relayCalls = [];
      rpcCalls = [];
      await runNotificationDispatch(supabaseWith([job({ authTokenRequired: true, authTokenHash })]), DISPATCH);
      expect(relayCalls, `hash ${JSON.stringify(authTokenHash)} was mailed`).toHaveLength(0);
      expect(called("complete_notification_job"), `hash ${JSON.stringify(authTokenHash)}`).toHaveLength(0);
    }
  });

  it("sends normally once the credential is there", async () => {
    // The guard must not be a blanket refusal — the ordinary path still has to work.
    const result = await runNotificationDispatch(
      supabaseWith([job({ authTokenRequired: true, authTokenHash: "abcdef0123456789abcdef0123456789", invitationToken: "tok-abc_123" })]),
      DISPATCH,
    );

    expect(result.ok).toBe(true);
    expect(relayCalls).toHaveLength(1);
    expect(called("complete_notification_job")).toHaveLength(1);
    expect(called("fail_notification_job")).toHaveLength(0);
  });

  it("leaves a genuinely pre-migration job on the legacy path", async () => {
    // Backward compatibility is keyed on the flag the new command writes, never on the template code.
    // A job queued before this shipped carries no flag, makes no one-click promise, and must still
    // deliver rather than being retro-actively condemned by a rule it predates.
    const result = await runNotificationDispatch(supabaseWith([job({ invitationToken: "tok-abc_123" })]), DISPATCH);

    expect(result.ok).toBe(true);
    expect(relayCalls, "a pre-migration invitation was blocked").toHaveLength(1);
    expect(called("complete_notification_job")).toHaveLength(1);
  });

  it("does not apply the guard to messages that make no such promise", async () => {
    // Only invitations promise a sign-in. An announcement carrying no credential is simply an
    // announcement, and must not be caught by a rule written for a different message.
    const result = await runNotificationDispatch(
      supabaseWith([job({ title: "Water shut off Tuesday" }, { templateCode: "announcement_published" })]),
      DISPATCH,
    );

    expect(result.ok).toBe(true);
    expect(relayCalls).toHaveLength(1);
    expect(called("fail_notification_job")).toHaveLength(0);
  });
});
