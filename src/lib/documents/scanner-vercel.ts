import "server-only";
import { z } from "zod";
import { SCAN_SANDBOX_CLEANUP_TIMEOUT_MS, SCAN_SANDBOX_SESSION_TIMEOUT_MS } from "@/lib/runtime/budget";
import type { ScanResult } from "./scanner";

export const VERCEL_SCAN_PROVIDER_CODE = "vercel-sandbox-clamav";

const inputDirectory = "/vercel/sandbox";
const inputPath = `${inputDirectory}/crecy-document.bin`;
const scanCommand = "/opt/crecy-scanner/verify-and-scan";
const maximumSignatureAgeSeconds = 3 * 24 * 60 * 60;
const maximumClockSkewSeconds = 5 * 60;
const receiptSchema = z.object({
  verdict: z.enum(["clean", "infected"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reference: z.string().trim().regex(/^[a-zA-Z0-9 _:./+-]{1,200}$/),
  signaturePublishedAt: z.number().int().positive(),
});

function readReceipt(stdout: string) {
  if (stdout.length > 1024) return null;
  const line = stdout.trim();
  if (/[\r\n]/.test(line)) return null;
  try {
    const parsed = receiptSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function scanInVercelSandbox(
  snapshotId: string,
  bytes: Buffer,
  observedSha256Hex: string,
  signal: AbortSignal,
): Promise<ScanResult> {
  const { Sandbox } = await import("@vercel/sandbox");
  signal.throwIfAborted();
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    persistent: false,
    networkPolicy: "deny-all",
    ports: [],
    // Vercel allocates 2 GiB per vCPU. ClamAV recommends 4 GiB for its full database.
    resources: { vcpus: 2 },
    timeout: SCAN_SANDBOX_SESSION_TIMEOUT_MS,
    signal,
  });
  try {
    await sandbox.mkDir(inputDirectory, { signal });
    await sandbox.writeFiles([{ path: inputPath, content: bytes, mode: 0o600 }], { signal });
    const command = await sandbox.runCommand({ cmd: scanCommand, args: [inputPath], signal });
    if (command.exitCode !== 0 && command.exitCode !== 1) {
      return { ok: false, errorCode: "SANDBOX_SCAN_FAILED", retryable: true };
    }

    const receipt = readReceipt(await command.stdout({ signal }));
    if (!receipt || command.exitCode !== (receipt.verdict === "clean" ? 0 : 1)) {
      return { ok: false, errorCode: "UNREADABLE_SCAN_VERDICT", retryable: true };
    }
    if (receipt.sha256 !== observedSha256Hex) {
      return { ok: false, errorCode: "SCAN_TARGET_MISMATCH", retryable: false };
    }
    const signatureAge = Math.floor(Date.now() / 1000) - receipt.signaturePublishedAt;
    if (signatureAge > maximumSignatureAgeSeconds || signatureAge < -maximumClockSkewSeconds) {
      return { ok: false, errorCode: "STALE_SCAN_SIGNATURES", retryable: true };
    }
    signal.throwIfAborted();
    return {
      ok: true,
      verdict: receipt.verdict,
      observedSha256Hex,
      providerCode: VERCEL_SCAN_PROVIDER_CODE,
      providerReference: receipt.reference,
    };
  } finally {
    // Use a separate deadline after a scan timeout. The VM also has a short hard expiration.
    await sandbox.stop({ signal: AbortSignal.timeout(SCAN_SANDBOX_CLEANUP_TIMEOUT_MS) }).catch(() => undefined);
  }
}
