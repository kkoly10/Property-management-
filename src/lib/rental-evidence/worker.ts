import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { scanInVercelSandbox } from "@/lib/documents/scanner-vercel";
import { SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS } from "@/lib/runtime/budget";
import { rentalEvidenceBucket, rentalEvidenceMaxBytes } from "@/lib/validation/rental-evidence";
import { rentalEvidenceEnabled } from "./http";

const claimedScan = z.object({ id: z.uuid(), objectKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive().max(rentalEvidenceMaxBytes) });
const purgeClaims = z.array(z.object({ id: z.uuid(), objectKey: z.string().min(1) })).max(25);

export async function runRentalEvidenceScan(supabase: SupabaseClient) {
  if (!rentalEvidenceEnabled()) return { state: "disabled", failed: false };
  // Restricted documents use only this isolated scanner. Generic relay and Cloudmersive
  // settings do not participate in this decision.
  const snapshot = process.env.CRECY_VERCEL_SCAN_SNAPSHOT_ID?.trim() ?? "";
  if (!/^snap_[a-zA-Z0-9_-]{1,180}$/.test(snapshot) || snapshot.includes("replace_")) {
    return { state: "scanner-unavailable", failed: true };
  }
  const claimId = crypto.randomUUID();
  const { data, error } = await supabase.rpc("claim_rental_evidence_scan", { p_claim_id: claimId });
  if (error) return { state: "claim-failed", failed: true };
  if (data === null) return { state: "idle", failed: false };
  const file = claimedScan.safeParse(data);
  if (!file.success) return { state: "claim-invalid", failed: true };

  const signal = AbortSignal.timeout(SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS);
  let verdict: "clean" | "infected" | "retry" | "invalid" = "retry";
  let observed: string | null = null;
  try {
    const { data: blob, error: readError } = await supabase.storage.from(rentalEvidenceBucket).download(file.data.objectKey, undefined, { signal });
    if (!readError && blob) {
      if (blob.size !== file.data.sizeBytes) verdict = "invalid";
      else {
        const bytes = Buffer.from(await blob.arrayBuffer());
        observed = createHash("sha256").update(bytes).digest("hex");
        if (observed !== file.data.sha256) verdict = "invalid";
        else {
          const scan = await scanInVercelSandbox(snapshot, bytes, observed, signal);
          verdict = scan.ok && scan.observedSha256Hex === observed ? scan.verdict : !scan.ok && scan.retryable ? "retry" : "invalid";
        }
      }
    }
  } catch {
    // A timeout or lost provider leaves this exact object quarantined for a retry.
  }
  const settlement = await supabase.rpc("settle_rental_evidence_scan", { p_claim_id: claimId,
    p_file_id: file.data.id, p_verdict: verdict, p_observed_sha256: observed });
  return settlement.error || settlement.data !== true
    ? { state: "settlement-failed", failed: true }
    : { state: verdict, failed: verdict === "retry" || verdict === "invalid" };
}

export async function runRentalEvidencePurge(supabase: SupabaseClient) {
  if (!rentalEvidenceEnabled() && process.env.CRECY_RENTAL_EVIDENCE_PURGE_ENABLED !== "1") {
    return { state: "disabled", removed: 0, failed: 0 };
  }
  const claimId = crypto.randomUUID();
  const { data, error } = await supabase.rpc("claim_rental_evidence_purge", { p_claim_id: claimId, p_limit: 10 });
  const claims = purgeClaims.safeParse(data);
  if (error || !claims.success) return { state: "claim-failed", removed: 0, failed: 1 };
  if (claims.data.length === 0) return { state: "idle", removed: 0, failed: 0 };
  const storage = supabase.storage.from(rentalEvidenceBucket);
  const results = await Promise.allSettled(claims.data.map(async (item) => {
    const deleted = await storage.remove([item.objectKey]);
    if (deleted.error) return false;
    const receipt = await supabase.rpc("complete_rental_evidence_purge", { p_claim_id: claimId, p_file_id: item.id });
    return !receipt.error && receipt.data === true;
  }));
  const removed = results.filter((result) => result.status === "fulfilled" && result.value).length;
  return { state: "processed", removed, failed: results.length - removed };
}
