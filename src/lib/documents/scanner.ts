import "server-only";
import { createHash } from "node:crypto";
import { classifyRelayStatus, type TransportFailure } from "@/lib/notifications/transport";

/**
 * Provider-neutral malware scanning for uploaded document versions.
 *
 * Crecy does not embed a scanning vendor and does not invent a provider identifier. The operator points
 * CRECY_DOCUMENT_SCAN_RELAY_URL at their own scanning service; this worker fetches the stored object,
 * computes the digest of the bytes it actually read, and asks the relay for a verdict. With no relay
 * configured the route reports "not configured" rather than pretending anything was scanned — a
 * document then stays quarantined, which is the safe direction to fail.
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

/** Objects larger than this are not streamed through the relay; they fail non-retryably. */
export const MAXIMUM_SCANNABLE_BYTES = 50 * 1024 * 1024;

export function getDocumentScanRelayConfig(): { url: string; secret: string } | null {
  const url = process.env.CRECY_DOCUMENT_SCAN_RELAY_URL;
  const secret = process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET;
  if (!url || url.includes("replace_") || !/^https:\/\//i.test(url)) return null;
  if (!secret || secret.includes("replace_") || secret.length < 16) return null;
  return { url, secret };
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

export function getDocumentScanner(): DocumentScanner | null {
  const config = getDocumentScanRelayConfig();
  if (!config) return null;
  return {
    providerCode: "relay",
    async scan(target: ScanTarget, source: DocumentObjectSource): Promise<ScanResult> {
      const { bytes, error } = await source.download(target.storageBucket, target.storagePath);
      if (error || !bytes) {
        // The object is missing or unreadable. Retryable on purpose: storage may simply be having a
        // bad minute, and dead-lettering here would strand a legitimate upload forever.
        return { ok: false, errorCode: "OBJECT_UNREADABLE", retryable: true };
      }
      if (bytes.byteLength > MAXIMUM_SCANNABLE_BYTES) {
        return { ok: false, errorCode: "OBJECT_TOO_LARGE_TO_SCAN", retryable: false };
      }
      const observedSha256Hex = createHash("sha256").update(bytes).digest("hex");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            authorization: `Bearer ${config.secret}`,
            "idempotency-key": target.documentScanJobId,
            "x-crecy-sha256": observedSha256Hex,
          },
          body: new Uint8Array(bytes),
          signal: controller.signal,
        });
        if (!response.ok) return classifyRelayStatus(response.status);
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
