import "server-only";
import { createHash } from "node:crypto";
import type { TransportFailure } from "@/lib/notifications/transport";
import { classifyScannerStatus } from "./scanner-failure";
import { SCAN_RELAY_TIMEOUT_MS, SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS } from "@/lib/runtime/budget";
import { scanInVercelSandbox, VERCEL_SCAN_PROVIDER_CODE } from "./scanner-vercel";

/**
 * Provider-neutral malware scanning for uploaded document versions.
 *
 * The worker fetches the stored object, computes the digest of the bytes it actually read, and asks
 * the configured scanner for a verdict. When no scanner is configured, documents stay quarantined.
 *
 * The observed digest is computed HERE, from the downloaded bytes, and is re-proved against both the
 * scan job and the live version row by complete_document_scan. That is what makes a verdict bind to a
 * specific object: a scanner that read something else cannot clean this version.
 */
export type ScanVerdict = {
  ok: true;
  verdict: "clean" | "infected";
  observedSha256Hex: string;
  providerCode: string;
  providerReference: string | null;
};
export type ScanFailure = TransportFailure;
export type ScanResult = ScanVerdict | ScanFailure;

export type ScanTarget = {
  documentScanJobId: string;
  storageBucket: string;
  storagePath: string;
};

/** Just enough of the storage client to fetch one object, so the scanner stays unit-testable. */
export type DocumentObjectSource = {
  download(bucket: string, path: string, signal?: AbortSignal): Promise<{ bytes: Buffer | null; error: string | null }>;
};

export type DocumentScanner = {
  readonly providerCode: string;
  scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult>;
};

/** Objects larger than this are not streamed through the relay; they fail non-retryably. */
export const MAXIMUM_SCANNABLE_BYTES = 50 * 1024 * 1024;

export function getDocumentScanRelayConfig(): { url: string; secret: string } | null {
  const url = process.env.CRECY_DOCUMENT_SCAN_RELAY_URL;
  const secret = process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET;
  if (!url || url.includes("replace_") || !/^https:\/\//i.test(url)) return null;
  if (!secret || secret.includes("replace_") || secret.length < 16) return null;
  return { url, secret };
}

export function getCloudmersiveScannerConfig(): { url: string; apiKey: string } | null {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY;
  const url = process.env.CRECY_CLOUDMERSIVE_SCAN_URL || "https://api.cloudmersive.com/virus/scan/file";
  if (!apiKey || apiKey.includes("replace_") || apiKey.length < 16) return null;
  if (!/^https:\/\//i.test(url)) return null;
  return { url, apiKey };
}

export function readCloudmersiveVerdict(body: unknown): "clean" | "infected" | null {
  if (!body || typeof body !== "object") return null;
  const clean = (body as Record<string, unknown>).CleanResult;
  if (clean === true) return "clean";
  if (clean === false) return "infected";
  return null;
}

async function readTargetBytes(
  target: ScanTarget,
  source: DocumentObjectSource,
  signal?: AbortSignal,
): Promise<{ bytes: Buffer; observedSha256Hex: string } | ScanFailure> {
  const { bytes, error } = await source.download(target.storageBucket, target.storagePath, signal);
  signal?.throwIfAborted();
  if (error || !bytes) return { ok: false, errorCode: "OBJECT_UNREADABLE", retryable: true };
  if (bytes.byteLength > MAXIMUM_SCANNABLE_BYTES) {
    return { ok: false, errorCode: "OBJECT_TOO_LARGE_TO_SCAN", retryable: false };
  }
  return {
    bytes,
    observedSha256Hex: createHash("sha256").update(bytes).digest("hex"),
  };
}

/**
 * A relay body is only a verdict if it says so unambiguously. Anything else — a missing field, an
 * unknown word, a truncated response — is a FAILED ATTEMPT, never a silent "clean". The asymmetry is
 * deliberate: a failed attempt leaves the document quarantined; an invented "clean" would release it.
 */
export function readScanVerdict(body: unknown): { verdict: "clean" | "infected"; reference: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const verdict = record.verdict;
  if (verdict !== "clean" && verdict !== "infected") return null;
  const raw = typeof record.reference === "string" ? record.reference.trim() : "";
  return { verdict, reference: raw ? raw.slice(0, 200) : null };
}

function relayScanner(config: { url: string; secret: string }): DocumentScanner {
  return {
    providerCode: "relay",
    async scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult> {
      const loaded = await readTargetBytes(target, source);
      if ("ok" in loaded) return loaded;
      const { bytes, observedSha256Hex } = loaded;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCAN_RELAY_TIMEOUT_MS);
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            authorization: "Bearer " + config.secret,
            "idempotency-key": target.documentScanJobId,
            "x-crecy-sha256": observedSha256Hex,
          },
          body: new Uint8Array(bytes),
          signal: controller.signal,
        });
        if (!response.ok) return classifyScannerStatus(response.status);
        const verdict = readScanVerdict(await response.json().catch(() => null));
        if (!verdict) return { ok: false, errorCode: "UNREADABLE_SCAN_VERDICT", retryable: true };
        return {
          ok: true,
          verdict: verdict.verdict,
          observedSha256Hex,
          providerCode: "relay",
          providerReference: verdict.reference,
        };
      } catch (caught) {
        const aborted = caught instanceof Error && caught.name === "AbortError";
        return { ok: false, errorCode: aborted ? "SCANNER_TIMEOUT" : "SCANNER_UNREACHABLE", retryable: true };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function cloudmersiveScanner(config: { url: string; apiKey: string }): DocumentScanner {
  return {
    providerCode: "cloudmersive",
    async scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult> {
      const loaded = await readTargetBytes(target, source);
      if ("ok" in loaded) return loaded;
      const { bytes, observedSha256Hex } = loaded;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCAN_RELAY_TIMEOUT_MS);
      try {
        const filename = target.storagePath.split("/").pop()?.slice(0, 180) || "upload.bin";
        const form = new FormData();
        form.append("inputFile", new Blob([new Uint8Array(bytes)]), filename);
        const response = await fetch(config.url, {
          method: "POST",
          headers: { Apikey: config.apiKey },
          body: form,
          signal: controller.signal,
        });
        if (!response.ok) return classifyScannerStatus(response.status);
        const verdict = readCloudmersiveVerdict(await response.json().catch(() => null));
        if (!verdict) return { ok: false, errorCode: "UNREADABLE_SCAN_VERDICT", retryable: true };
        return {
          ok: true,
          verdict,
          observedSha256Hex,
          providerCode: "cloudmersive",
          providerReference: null,
        };
      } catch (caught) {
        const aborted = caught instanceof Error && caught.name === "AbortError";
        return { ok: false, errorCode: aborted ? "SCANNER_TIMEOUT" : "SCANNER_UNREACHABLE", retryable: true };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function vercelSandboxScanner(snapshotId: string): DocumentScanner {
  return {
    providerCode: VERCEL_SCAN_PROVIDER_CODE,
    async scan(target, source) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS);
      try {
        const loaded = await readTargetBytes(target, source, controller.signal);
        if ("ok" in loaded) return loaded;
        return await scanInVercelSandbox(snapshotId, loaded.bytes, loaded.observedSha256Hex, controller.signal);
      } catch {
        return {
          ok: false,
          errorCode: controller.signal.aborted ? "SCANNER_TIMEOUT" : "SCANNER_UNREACHABLE",
          retryable: true,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getDocumentScanner(): DocumentScanner | null {
  const relay = getDocumentScanRelayConfig();
  if (relay) return relayScanner(relay);
  const cloudmersive = getCloudmersiveScannerConfig();
  if (cloudmersive) return cloudmersiveScanner(cloudmersive);
  const snapshotId = process.env.CRECY_VERCEL_SCAN_SNAPSHOT_ID?.trim() ?? "";
  if (/^snap_[a-zA-Z0-9_-]{1,180}$/.test(snapshotId) && !snapshotId.includes("replace_")) {
    return vercelSandboxScanner(snapshotId);
  }
  return null;
}
