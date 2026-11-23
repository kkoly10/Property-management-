import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userRpc: vi.fn(), adminRpc: vi.fn(), download: vi.fn(), remove: vi.fn(),
  context: vi.fn(), scan: vi.fn(), after: vi.fn() }));
const actor = "a1000000-0000-4000-8000-000000000001";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: actor } } }) }, rpc: mocks.userRpc,
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: (...args: unknown[]) => {
  const response = Promise.resolve(mocks.adminRpc(...args));
  return Object.assign(response, { abortSignal: () => response });
},
  storage: { from: () => ({ download: mocks.download, remove: mocks.remove }) },
}) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/organization/context", () => ({ getOrganizationContext: mocks.context }));
vi.mock("@/lib/documents/scanner-vercel", () => ({ scanInVercelSandbox: mocks.scan }));

import { GET as getEvidence, POST as updateEvidence } from "@/app/api/v1/rental-applications/evidence/route";
import { GET as readEvidence } from "@/app/api/v1/rental-applications/evidence/file/route";
import { GET as readOperatorEvidence } from "@/app/api/v1/rental-applications/evidence-review/file/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRentalEvidencePurge, runRentalEvidenceScan } from "./worker";

const reference = "APP-1234ABCDEF90";
const file = "a2000000-0000-4000-8000-000000000002";
const organizationId = "a3000000-0000-4000-8000-000000000003";
const applicationId = "a4000000-0000-4000-8000-000000000004";
const unitId = "a5000000-0000-4000-8000-000000000005";
const origin = "https://rent.crecyos.com";
const objectKey = `${organizationId}/${applicationId}/${file}`;
const bytes = "%PDF-1.4\nfixture";
const digest = createHash("sha256").update(bytes).digest("hex");
const descriptor = { id: file, status: "awaiting_upload", objectKey, sizeBytes: bytes.length, sha256: digest, contentType: "application/pdf" };

function finalize(requestOrigin = origin) {
  return new Request(`${origin}/api/v1/rental-applications/evidence`, { method: "POST",
    headers: { origin: requestOrigin }, body: JSON.stringify({ action: "finalize", reference, fileId: file }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRECY_RENTAL_EVIDENCE_ENABLED", "1");
  vi.stubEnv("CRECY_VERCEL_SCAN_AUTO_REFRESH", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("private rental evidence HTTP", () => {
  it("defaults off and rejects cross-origin writes before reading any user state", async () => {
    const wrongOrigin = await updateEvidence(finalize("https://unrelated.example.test"));
    expect(wrongOrigin.status).toBe(403);
    vi.unstubAllEnvs();
    vi.stubEnv("CRECY_RENTAL_EVIDENCE_ENABLED", "");
    const disabled = await getEvidence(new Request(`${origin}/api/v1/rental-applications/evidence?ref=${reference}`));
    expect(disabled.status).toBe(404);
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it("finalizes only the inspected bytes through the trusted worker boundary", async () => {
    mocks.userRpc.mockResolvedValue({ data: descriptor, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    mocks.adminRpc.mockResolvedValue({ data: { id: file, status: "quarantined" }, error: null });
    const response = await updateEvidence(finalize());
    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith("finish_rental_application_evidence_upload", {
      p_actor_id: actor, p_file_id: file, p_size_bytes: bytes.length, p_sha256: digest,
    });
    expect(await response.json()).toEqual({ id: file, status: "quarantined" });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.adminRpc).toHaveBeenCalledOnce();
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", "snap_synthetic");
    mocks.adminRpc.mockResolvedValueOnce({ data: [], error: null });
    await mocks.after.mock.calls[0][0]();
    expect(mocks.adminRpc).toHaveBeenLastCalledWith("claim_rental_evidence_scan_batch", {
      p_file_id: file, p_limit: 1, p_claim_id: expect.any(String),
    });
  });

  it("does not finalize or release a byte substitution", async () => {
    mocks.userRpc.mockResolvedValue({ data: descriptor, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([bytes.replace("fixture", "changes")]), error: null });
    expect((await updateEvidence(finalize())).status).toBe(422);
    expect((await readEvidence(new Request(`${origin}/api/v1/rental-applications/evidence/file?ref=${reference}&fileId=${file}`))).status).toBe(404);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("never reads object bytes on a workspace mismatch or denied application", async () => {
    const url = `https://app.crecyos.com/api/v1/rental-applications/evidence-review/file?organizationId=${organizationId}&applicationId=${applicationId}&unitId=${unitId}&fileId=${file}`;
    mocks.context.mockResolvedValue({ active: { organizationId: actor } });
    expect((await readOperatorEvidence(new Request(url))).status).toBe(404);
    expect(mocks.userRpc).not.toHaveBeenCalled();
    mocks.context.mockResolvedValue({ active: { organizationId } });
    mocks.userRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "EVIDENCE_UNAVAILABLE" } });
    expect((await readOperatorEvidence(new Request(url))).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("streams an authorized clean document privately without returning a storage URL", async () => {
    mocks.userRpc.mockResolvedValue({ data: descriptor, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    const response = await readEvidence(new Request(`${origin}/api/v1/rental-applications/evidence/file?ref=${reference}&fileId=${file}`));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe(bytes);
  });
});

describe("restricted scanner and purge", () => {
  it("sends only the exact approved bytes to the isolated scanner and settles their matching digest", async () => {
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", "snap_synthetic");
    mocks.adminRpc.mockResolvedValueOnce({ data: [descriptor], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    mocks.download.mockResolvedValueOnce({ data: new Blob([bytes]), error: null });
    mocks.scan.mockResolvedValueOnce({ ok: true, observedSha256Hex: digest, verdict: "clean" });
    const outcome = await runRentalEvidenceScan(createAdminClient());
    expect(outcome).toMatchObject({ state: "processed", claimed: 1, clean: 1, failed: 0 });
    expect(mocks.scan).toHaveBeenCalledWith("snap_synthetic", Buffer.from(bytes), digest, expect.anything());
    expect(mocks.adminRpc).toHaveBeenLastCalledWith("settle_rental_evidence_scan", expect.objectContaining({
      p_file_id: file, p_verdict: "clean", p_observed_sha256: digest,
    }));
  });

  it("rejects a replacement object before it can reach the isolated scanner", async () => {
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", "snap_synthetic");
    mocks.adminRpc.mockResolvedValueOnce({ data: [descriptor], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([bytes.replace("fixture", "changes")]), error: null });
    const outcome = await runRentalEvidenceScan(createAdminClient());
    expect(outcome).toMatchObject({ invalid: 1, failed: 1 });
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenLastCalledWith("settle_rental_evidence_scan", expect.objectContaining({ p_verdict: "invalid" }));
  });

  it("keeps exact scans restricted during rollout and declines a claim that does not match the file", async () => {
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", "snap_synthetic");
    mocks.adminRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect(await runRentalEvidenceScan(createAdminClient(), { fileId: file }))
      .toMatchObject({ state: "deferred", claimed: 0 });
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
    mocks.adminRpc.mockResolvedValueOnce({ data: [descriptor], error: null });
    expect(await runRentalEvidenceScan(createAdminClient(), { fileId: actor }))
      .toMatchObject({ state: "claim-invalid", claimed: 0, failed: 1 });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("drains matching files concurrently in one bounded batch and settles each exact claim", async () => {
    vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", "snap_synthetic");
    const anotherFile = "b2000000-0000-4000-8000-000000000002";
    const second = { ...descriptor, id: anotherFile, objectKey: `${organizationId}/${applicationId}/${anotherFile}` };
    mocks.adminRpc.mockResolvedValueOnce({ data: [descriptor, second], error: null })
      .mockResolvedValue({ data: true, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    let finish!: () => void;
    const scannerReady = new Promise<void>((resolve) => { finish = resolve; });
    mocks.scan.mockImplementation(async () => {
      await scannerReady;
      return { ok: true, observedSha256Hex: digest, verdict: "clean" };
    });
    const processing = runRentalEvidenceScan(createAdminClient());
    try {
      await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledTimes(2));
      expect(mocks.adminRpc).toHaveBeenCalledOnce();
      expect(mocks.adminRpc).toHaveBeenCalledWith("claim_rental_evidence_scan_batch", {
        p_claim_id: expect.any(String), p_limit: 3, p_file_id: null,
      });
    } finally {
      finish();
    }
    expect(await processing).toMatchObject({ state: "processed", claimed: 2, clean: 2, failed: 0 });
    const claimId = mocks.adminRpc.mock.calls[0][1].p_claim_id;
    for (const id of [file, anotherFile]) expect(mocks.adminRpc).toHaveBeenCalledWith("settle_rental_evidence_scan", {
      p_claim_id: claimId, p_file_id: id, p_verdict: "clean", p_observed_sha256: digest,
    });
  });

  it("leaves the deletion work retryable when object removal fails", async () => {
    mocks.adminRpc.mockResolvedValueOnce({ data: [{ id: file, objectKey }], error: null });
    mocks.remove.mockResolvedValueOnce({ data: null, error: { message: "provider error" } });
    expect(await runRentalEvidencePurge(createAdminClient())).toEqual({ state: "processed", removed: 0, failed: 1 });
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });
});
