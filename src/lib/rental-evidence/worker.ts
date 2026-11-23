import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveVercelScannerSnapshot } from "@/lib/documents/scanner-snapshot";
import { scanInVercelSandbox } from "@/lib/documents/scanner-vercel";
import { RENTAL_EVIDENCE_SCAN_BUDGET_MS, RENTAL_EVIDENCE_SCAN_CONCURRENCY, RENTAL_EVIDENCE_SCAN_RPC_TIMEOUT_MS,
  SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS, SCAN_SANDBOX_CLEANUP_TIMEOUT_MS } from "@/lib/runtime/budget";
import { rentalEvidenceBucket, rentalEvidenceMaxBytes } from "@/lib/validation/rental-evidence";
import { rentalEvidenceEnabled } from "./http";

const uuid = z.uuid();
const claimedScan = z.object({ id: uuid, objectKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive().max(rentalEvidenceMaxBytes) })
  .refine(({ id, objectKey }) => {
    const parts = objectKey.split("/");
    return parts.length === 3 && parts[2] === id && parts.every((part) => uuid.safeParse(part).success);
  });
const claimedScans = z.array(claimedScan).max(RENTAL_EVIDENCE_SCAN_CONCURRENCY);
const purgeClaims = z.array(z.object({ id: z.uuid(), objectKey: z.string().min(1) })).max(25);

type EvidenceScanVerdict = "clean" | "infected" | "retry" | "invalid" | "settlementFailed";

function scanRpcSignal(deadline: number) {
  return AbortSignal.timeout(Math.max(1, Math.min(RENTAL_EVIDENCE_SCAN_RPC_TIMEOUT_MS, deadline - Date.now())));
}

async function scanClaim(supabase: SupabaseClient, file: z.infer<typeof claimedScan>, claimId: string,
  snapshot: string, deadline: number): Promise<EvidenceScanVerdict> {
  const scanTime = Math.min(SCAN_SANDBOX_ATTEMPT_TIMEOUT_MS,
    deadline - Date.now() - SCAN_SANDBOX_CLEANUP_TIMEOUT_MS - RENTAL_EVIDENCE_SCAN_RPC_TIMEOUT_MS);
  let verdict: "clean" | "infected" | "retry" | "invalid" = "retry";
  let observed: string | null = null;
  try {
    if (scanTime > 0) {
      const signal = AbortSignal.timeout(scanTime);
      const { data: blob, error: readError } = await supabase.storage.from(rentalEvidenceBucket).download(file.objectKey, undefined, { signal });
      if (readError || !blob) throw new Error("Evidence read unavailable");
      if (blob.size !== file.sizeBytes) verdict = "invalid";
      else {
        const bytes = Buffer.from(await blob.arrayBuffer());
        observed = createHash("sha256").update(bytes).digest("hex");
        if (observed !== file.sha256) verdict = "invalid";
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
    p_file_id: file.id, p_verdict: verdict, p_observed_sha256: observed }).abortSignal(scanRpcSignal(deadline));
  return settlement.error || settlement.data !== true ? "settlementFailed" : verdict;
}

export async function runRentalEvidenceScan(supabase: SupabaseClient, options: { fileId?: string; deadline?: number } = {}) {
  if (!rentalEvidenceEnabled()) return { state: "disabled", claimed: 0, failed: 0 };
  const exact = options.fileId;
  if (exact !== undefined && !uuid.safeParse(exact).success) return { state: "claim-invalid", claimed: 0, failed: 1 };
  const deadline = options.deadline ?? Date.now() + RENTAL_EVIDENCE_SCAN_BUDGET_MS;
  if (deadline - Date.now() < 20_000) return { state: "deferred", claimed: 0, failed: 0 };
  // Restricted documents use only this isolated scanner. Generic relay and Cloudmersive
  // settings do not participate in this decision.
  const snapshot = await resolveVercelScannerSnapshot(supabase, scanRpcSignal(deadline));
  if (!snapshot) return { state: "scanner-unavailable", claimed: 0, failed: 1 };
  const claimId = crypto.randomUUID();
  let { data, error } = await supabase.rpc("claim_rental_evidence_scan_batch", {
    p_claim_id: claimId, p_limit: exact ? 1 : RENTAL_EVIDENCE_SCAN_CONCURRENCY, p_file_id: exact ?? null,
  }).abortSignal(scanRpcSignal(deadline));
  if (error?.code === "PGRST202" && !exact) {
    // Only the scheduled drain can use the previous unrestricted one-job claim during rollout.
    const legacy = await supabase.rpc("claim_rental_evidence_scan", { p_claim_id: claimId }).abortSignal(scanRpcSignal(deadline));
    data = legacy.data === null ? [] : [legacy.data];
    error = legacy.error;
  }
  if (error?.code === "PGRST202" && exact) return { state: "deferred", claimed: 0, failed: 0 };
  if (error) return { state: "claim-failed", claimed: 0, failed: 1 };
  const files = claimedScans.safeParse(data);
  if (!files.success || (exact && files.data.some(({ id }) => id !== exact))
    || new Set(files.data.map(({ id }) => id)).size !== files.data.length) {
    return { state: "claim-invalid", claimed: 0, failed: 1 };
  }
  if (files.data.length === 0) return { state: "idle", claimed: 0, failed: 0 };
  const results = await Promise.allSettled(files.data.map((file) => scanClaim(supabase, file, claimId, snapshot, deadline)));
  const counts: Record<EvidenceScanVerdict, number> = { clean: 0, infected: 0, retry: 0, invalid: 0, settlementFailed: 0 };
  for (const result of results) counts[result.status === "fulfilled" ? result.value : "settlementFailed"]++;
  return { state: "processed", claimed: files.data.length, ...counts, failed: counts.retry + counts.invalid + counts.settlementFailed };
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
