import "server-only";
import { createHash } from "node:crypto";
import { classifyRelayStatus, type TransportFailure } from "@/lib/notifications/transport";
import { SCAN_RELAY_TIMEOUT_MS } from "@/lib/runtime/budget";

/**
 * Provider-neutral malware scanning for uploaded document versions.
 *
 * Crecy supports two production adapters:
 *   1. a custom relay named by CRECY_DOCUMENT_SCAN_RELAY_URL; and
 *   2. a direct Cloudmersive adapter when CLOUDMERSIVE_API_KEY is configured.
 *
 * The relay remains the override so installations with their own scanner keep the existing contract.
 * If neither adapter is configured the worker reports "not configured" rather than pretending anything
 * was scanned — a document then stays quarantined, which is the safe direction to fail.
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
  download(bucket: string, path: string): Promise<{ bytes: Buffer | null; error: string | null }>;
};

export type DocumentScanner = {
  readonly providerCode: string;
  scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult>;
};

/** Objects larger than this are not streamed to a scanning provider; they fail non-retryably. */
export const MAXIMUM_SCANNABLE_BYTES = 50 * 1024 * 1024;

const CLOUDMERSIVE_SCAN_ENDPOINT = "https://api.cloudmersive.com/virus/scan/file";

export function getDocumentScanRelayConfig(): { url: string; secret: string } | null {
  const url = process.env.CRECY_DOCUMENT_SCAN_RELAY_URL;
  const secret = process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET;
  if (!url || url.includes("replace_") || !/^https:\/\//i.test(url)) return null;
  if (!secret || secret.includes("replace_") || secret.length < 16) return null;
  return { url, secret };
}

export function getCloudmersiveScanConfig(): { apiKey: string } | null {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY?.trim();
  if (!apiKey || apiKey.includes("replace_") || apiKey.length < 16) return null;
  return { apiKey };
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

/**
 * Cloudmersive's simple file-scan response is intentionally reduced to the same two-state contract.
 * CleanResult must be a literal boolean; a malformed or partial provider response is not a verdict.
 */
export function readCloudmersiveVerdict(body: unknown): { verdict: "clean" | "infected"; reference: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.CleanResult !== "boolean") return null;

  let reference: string | null = null;
  if (!record.CleanResult && Array.isArray(record.FoundViruses)) {
    for (const item of record.FoundViruses) {
      if (!item || typeof item !== "object") continue;
      const virusName = (item as Record<string, unknown>).VirusName;
      if (typeof virusName === "string" && virusName.trim()) {
        reference = virusName.trim().slice(0, 200);
        break;
      }
    }
  }

  return { verdict: record.CleanResult ? "clean" : "infected", reference };
}

async function loadObject(
  target: ScanTarget,
  source: DocumentObjectSource,
): Promise<{ ok: true; bytes: Buffer; observedSha256Hex: string } | ScanFailure> {
  const { bytes, error } = await source.download(target.storageBucket, target.storagePath);
  if (error || !bytes) {
    return { ok: false, errorCode: "OBJECT_UNREADABLE", retryable: true };
  }
  if (bytes.byteLength > MAXIMUM_SCANNABLE_BYTES) {
    return { ok: false, errorCode: "OBJECT_TOO_LARGE_TO_SCAN", retryable: false };
  }
  return {
    ok: true,
    bytes,
    observedSha256Hex: createHash("sha256").update(bytes).digest("hex"),
  };
}

function classifyScannerProviderStatus(status: number): ScanFailure {
  if (status === 402) {
    // Billing/quota is operator configuration, not a defect in this document. Keep it retryable while
    // the provider account is repaired rather than dead-lettering every file in the queue.
    return { ok: false, errorCode: "SCANNER_HTTP_402", retryable: true };
  }
  const classified = classifyRelayStatus(status);
  return { ...classified, errorCode: "SCANNER_HTTP_" + status };
}

function relayScanner(config: { url: string; secret: string }): DocumentScanner {
  return {
    providerCode: "relay",
    async scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult> {
      const loaded = await loadObject(target, source);
      if (!loaded.ok) return loaded;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCAN_RELAY_TIMEOUT_MS);
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            authorization: "Bearer " + config.secret,
            "idempotency-key": target.documentScanJobId,
            "x-crecy-sha256": loaded.observedSha256Hex,
          },
          body: new Uint8Array(loaded.bytes),
          signal: controller.signal,
        });
        if (!response.ok) return classifyRelayStatus(response.status);
        const verdict = readScanVerdict(await response.json().catch(() => null));
        if (!verdict) return { ok: false, errorCode: "UNREADABLE_SCAN_VERDICT", retryable: true };
        return {
          ok: true,
          verdict: verdict.verdict,
          observedSha256Hex: loaded.observedSha256Hex,
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

function cloudmersiveScanner(config: { apiKey: string }): DocumentScanner {
  return {
    providerCode: "cloudmersive",
    async scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult> {
      const loaded = await loadObject(target, source);
      if (!loaded.ok) return loaded;

      const form = new FormData();
      const filename = target.storagePath.split("/").pop()?.trim() || "document";
      form.append("inputFile", new Blob([new Uint8Array(loaded.bytes)]), filename);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCAN_RELAY_TIMEOUT_MS);
      try {
        const response = await fetch(CLOUDMERSIVE_SCAN_ENDPOINT, {
          method: "POST",
          headers: { Apikey: config.apiKey },
          body: form,
          signal: controller.signal,
        });
        if (!response.ok) return classifyScannerProviderStatus(response.status);
        const verdict = readCloudmersiveVerdict(await response.json().catch(() => null));
        if (!verdict) return { ok: false, errorCode: "UNREADABLE_SCAN_VERDICT", retryable: true };
        return {
          ok: true,
          verdict: verdict.verdict,
          observedSha256Hex: loaded.observedSha256Hex,
          providerCode: "cloudmersive",
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

export function getDocumentScanner(): DocumentScanner | null {
  const relay = getDocumentScanRelayConfig();
  if (relay) return relayScanner(relay);

  const cloudmersive = getCloudmersiveScanConfig();
  if (cloudmersive) return cloudmersiveScanner(cloudmersive);

  return null;
}
