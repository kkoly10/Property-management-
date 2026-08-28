import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDocumentScanDispatch } from "./jobs";
import { SCAN_WORKER_CONCURRENCY, worstCaseScanRunSeconds } from "./budget";

/**
 * Partial transport stalls: one job in a batch hangs while the others answer.
 *
 * The behaviour that matters is that a stall is CONTAINED. It must not serialize behind the healthy
 * jobs, must not consume the whole function budget, and must leave the stalled job recoverable rather
 * than stranded in `scanning` — a claimed job whose function was killed sits there until the stall
 * sweep, which is the failure the bounded budget exists to prevent.
 */
type Rpc = { name: string; args: Record<string, unknown> };

function supabaseDouble(jobs: unknown[], calls: Rpc[]) {
  return {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      if (name === "claim_document_scan_jobs") return { data: { jobs }, error: null };
      return { data: {}, error: null };
    },
    storage: {
      from: () => ({ download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null }) }),
    },
  } as never;
}

function jobFixture(index: number) {
  return {
    documentScanJobId: `1111111${index}-1111-4111-8111-111111111111`,
    organizationId: "22222222-2222-4222-8222-222222222222",
    documentVersionId: `3333333${index}-3333-4333-8333-333333333333`,
    storageBucket: "private-documents",
    storagePath: `organizations/o/property/p/file-${index}.pdf`,
    expectedSha256Hex: "a".repeat(64),
    attempt: 1,
    maxAttempts: 5,
  };
}

describe("runDocumentScanDispatch under a partial transport stall", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.CRECY_DOCUMENT_SCAN_RELAY_URL = "https://scanner.example.com/scan";
    process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET = "0123456789abcdef0123456789abcdef";
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("resolves the healthy jobs and reports the stalled one as a retryable failure", async () => {
    const calls: Rpc[] = [];
    const jobs = [jobFixture(0), jobFixture(1), jobFixture(2)];

    // The middle job's relay never answers; the scanner's own AbortController turns that into a
    // retryable SCANNER_TIMEOUT rather than an unbounded wait.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const path = String(init.headers && (init.headers as Record<string, string>)["idempotency-key"]);
      if (path === jobs[1].documentScanJobId) {
        return await new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      }
      return { ok: true, status: 200, json: async () => ({ verdict: "clean", reference: "ok" }) } as unknown as Response;
    }));

    vi.useFakeTimers();
    const run = runDocumentScanDispatch(supabaseDouble(jobs, calls), { limit: 3, workerRunId: "stall-run-0001", stallMinutes: 30 });
    await vi.runAllTimersAsync();
    const result = await run;
    vi.useRealTimers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.claimed).toBe(3);
    expect(result.summary.cleaned).toBe(2);
    expect(result.summary.failed).toBe(1);

    // The decisive part: the stalled job is RESOLVED, not left claimed. A job the worker abandons sits
    // in `scanning` until the stall sweep, and every document behind it stays unusable meanwhile.
    const failed = calls.filter((call) => call.name === "fail_document_scan");
    expect(failed).toHaveLength(1);
    expect(failed[0].args.p_document_scan_job_id).toBe(jobs[1].documentScanJobId);
    expect(failed[0].args.p_error_code).toBe("SCANNER_TIMEOUT");
    // Retryable, so the backoff carries it — a relay incident must not dead-letter a good document.
    expect(failed[0].args.p_retryable).toBe(true);

    // Every claimed job reached a terminal state for this attempt.
    const resolved = calls.filter((call) => call.name === "complete_document_scan" || call.name === "fail_document_scan");
    expect(resolved).toHaveLength(jobs.length);
  });

  it("does not serialize a stall behind the healthy jobs", async () => {
    // With sequential scanning the stall's cost is paid before the later jobs even start, which is how
    // a batch of ten 60-second timeouts became ten minutes of wall clock.
    const oneWave = worstCaseScanRunSeconds(SCAN_WORKER_CONCURRENCY, SCAN_WORKER_CONCURRENCY, 12_000, 0);
    const serialized = worstCaseScanRunSeconds(SCAN_WORKER_CONCURRENCY, 1, 12_000, 0);
    expect(oneWave).toBeLessThan(serialized);
  });

  it("reports 'not configured' rather than pretending to scan when no relay is set", async () => {
    delete process.env.CRECY_DOCUMENT_SCAN_RELAY_URL;
    delete process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET;
    const calls: Rpc[] = [];
    const result = await runDocumentScanDispatch(supabaseDouble([], calls), { limit: 3, workerRunId: "unconfigured-01", stallMinutes: 30 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    // Nothing was claimed, so nothing can be stranded.
    expect(calls).toHaveLength(0);
  });
});
