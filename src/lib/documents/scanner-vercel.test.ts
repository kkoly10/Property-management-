import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maximumDocumentSizeBytes } from "@/lib/validation/documents";
import { SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS, SCAN_SANDBOX_SESSION_TIMEOUT_MS } from "@/lib/runtime/budget";
import { getDocumentScanner } from "./scanner";

const { create, mkDir, writeFiles, runCommand, stdout, stop } = vi.hoisted(() => ({
  create: vi.fn(),
  mkDir: vi.fn(),
  writeFiles: vi.fn(),
  runCommand: vi.fn(),
  stdout: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create } }));

const snapshotId = "snap_crecy_scanner";
const storedBytes = Buffer.from("synthetic document");
const sha256 = createHash("sha256").update(storedBytes).digest("hex");
const inputPath = "/vercel/sandbox/crecy-document.bin";
const target = { documentScanJobId: "job", storageBucket: "private-documents", storagePath: "fixture.pdf" };

function receipt(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    verdict: "clean",
    sha256,
    reference: "ClamAV 1.4.7:daily-27092",
    signaturePublishedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  }) + "\n";
}

function scan(bytes = storedBytes) {
  return getDocumentScanner()!.scan(target, { download: async () => ({ bytes, error: null }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRECY_DOCUMENT_SCAN_RELAY_URL", "");
  vi.stubEnv("CRECY_DOCUMENT_SCAN_RELAY_SECRET", "");
  vi.stubEnv("CLOUDMERSIVE_API_KEY", "");
  vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", snapshotId);
  create.mockResolvedValue({ mkDir, writeFiles, runCommand, stop });
  mkDir.mockResolvedValue(undefined);
  writeFiles.mockResolvedValue(undefined);
  stop.mockResolvedValue(undefined);
  runCommand.mockResolvedValue({ exitCode: 0, stdout });
  stdout.mockResolvedValue(receipt());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Vercel Sandbox document scanning", () => {
  it("opts in without contacting Vercel, rejects placeholders, and preserves existing provider precedence", () => {
    expect(getDocumentScanner()?.providerCode).toBe("vercel-sandbox-clamav");
    expect(create).not.toHaveBeenCalled();
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", "snap_replace_me");
    expect(getDocumentScanner()).toBeNull();
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", snapshotId);
    vi.stubEnv("CLOUDMERSIVE_API_KEY", "synthetic-api-key-12345");
    expect(getDocumentScanner()?.providerCode).toBe("cloudmersive");
  });

  it("passes a full 25 MiB object through the private SDK file path and binds the signed-byte hash", async () => {
    const bytes = Buffer.alloc(maximumDocumentSizeBytes, 1);
    const objectHash = createHash("sha256").update(bytes).digest("hex");
    stdout.mockResolvedValue(receipt({ sha256: objectHash }));

    await expect(scan(bytes)).resolves.toEqual({
      ok: true,
      verdict: "clean",
      observedSha256Hex: objectHash,
      providerCode: "vercel-sandbox-clamav",
      providerReference: "ClamAV 1.4.7:daily-27092",
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      source: { type: "snapshot", snapshotId },
      persistent: false,
      networkPolicy: "deny-all",
      ports: [],
      resources: { vcpus: 2 },
      timeout: SCAN_SANDBOX_SESSION_TIMEOUT_MS,
      signal: expect.any(AbortSignal),
    });
    expect(mkDir).toHaveBeenCalledExactlyOnceWith("/vercel/sandbox", { signal: expect.any(AbortSignal) });
    expect(mkDir.mock.invocationCallOrder[0]).toBeLessThan(writeFiles.mock.invocationCallOrder[0]);
    expect(writeFiles).toHaveBeenCalledTimes(1);
    expect(writeFiles.mock.calls[0][0][0]).toMatchObject({ path: inputPath, mode: 0o600 });
    expect(writeFiles.mock.calls[0][0][0].content).toBe(bytes);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith({
      cmd: "/opt/crecy-scanner/verify-and-scan", args: [inputPath], signal: expect.any(AbortSignal),
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("accepts an infected verdict only with its matching exit code", async () => {
    stdout.mockResolvedValue(receipt({ verdict: "infected" }));
    await expect(scan()).resolves.toMatchObject({ ok: false, errorCode: "UNREADABLE_SCAN_VERDICT" });
    runCommand.mockResolvedValue({ exitCode: 1, stdout });
    await expect(scan()).resolves.toMatchObject({ ok: true, verdict: "infected", observedSha256Hex: sha256 });
  });

  it("keeps missing, mismatched, stale or indeterminate results quarantined", async () => {
    stdout.mockResolvedValueOnce("no receipt");
    await expect(scan()).resolves.toMatchObject({ ok: false, errorCode: "UNREADABLE_SCAN_VERDICT" });
    stdout.mockResolvedValueOnce(receipt({ sha256: "a".repeat(64) }));
    await expect(scan()).resolves.toMatchObject({ ok: false, errorCode: "SCAN_TARGET_MISMATCH", retryable: false });
    stdout.mockResolvedValueOnce(receipt({ signaturePublishedAt: 1 }));
    await expect(scan()).resolves.toMatchObject({ ok: false, errorCode: "STALE_SCAN_SIGNATURES", retryable: true });
    runCommand.mockResolvedValueOnce({ exitCode: 2, stdout });
    await expect(scan()).resolves.toMatchObject({ ok: false, errorCode: "SANDBOX_SCAN_FAILED", retryable: true });
    expect(stop).toHaveBeenCalledTimes(4);
  });

  it("never starts a sandbox for an unreadable object", async () => {
    const result = await getDocumentScanner()!.scan(target, { download: async () => ({ bytes: null, error: "missing" }) });
    expect(result).toMatchObject({ ok: false, errorCode: "OBJECT_UNREADABLE", retryable: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("stops a restored sandbox without uploading when the scan directory cannot be created", async () => {
    mkDir.mockRejectedValue(new Error("directory unavailable"));
    await expect(scan()).resolves.toMatchObject({ ok: false, errorCode: "SCANNER_UNREACHABLE", retryable: true });
    expect(writeFiles).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("cancels work at the scan deadline and still stops the sandbox", async () => {
    vi.useFakeTimers();
    runCommand.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const result = scan();
    await vi.advanceTimersByTimeAsync(SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({ ok: false, errorCode: "SCANNER_TIMEOUT", retryable: true });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0][0].signal.aborted).toBe(false);
  });
});
