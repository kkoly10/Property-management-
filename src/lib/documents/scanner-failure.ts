import { classifyRelayStatus, type TransportFailure } from "@/lib/notifications/transport";

/** Quota and billing can recover without changing the document. The retry limit still applies. */
export function classifyScannerStatus(status: number): TransportFailure {
  if (status === 402) return { ok: false, errorCode: "SCANNER_HTTP_402", retryable: true };
  return classifyRelayStatus(status);
}
