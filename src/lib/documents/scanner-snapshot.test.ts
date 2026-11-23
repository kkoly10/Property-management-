import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshVercelScannerSnapshot, resolveVercelScannerSnapshot } from "./scanner-snapshot";

const sandbox = vi.hoisted(() => ({
  create: vi.fn(), runCommand: vi.fn(), updateNetworkPolicy: vi.fn(), snapshot: vi.fn(), stop: vi.fn(),
}));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: sandbox.create } }));
const SEED = "snap_fixture_seed";
const NEW = "snap_fixture_replacement";
const receipt = (ageSeconds = 0) => ({
  exitCode: 0,
  stdout: async () => JSON.stringify({ dailyRevision: 42, signaturePublishedAt: Math.floor(Date.now() / 1_000) - ageSeconds }),
});
const result = (data: unknown, error: unknown = null) => ({ abortSignal: async () => ({ data, error }) });
const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc } as unknown as SupabaseClient);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRECY_VERCEL_SCAN_SNAPSHOT_ID", SEED);
  vi.stubEnv("CRECY_VERCEL_SCAN_AUTO_REFRESH", "1");
  sandbox.create.mockResolvedValue(sandbox);
  sandbox.stop.mockResolvedValue(undefined);
  sandbox.snapshot.mockResolvedValue({ snapshotId: NEW, expiresAt: new Date(Date.now() + 6 * 86400_000) });
  sandbox.runCommand.mockResolvedValue(receipt());
});
afterEach(() => vi.unstubAllEnvs());

it("uses the pinned snapshot and makes no calls with automatic refresh disabled", async () => {
  vi.stubEnv("CRECY_VERCEL_SCAN_AUTO_REFRESH", "");
  const rpc = vi.fn();
  expect(await resolveVercelScannerSnapshot(client(rpc))).toBe(SEED);
  expect(await refreshVercelScannerSnapshot(client(rpc))).toMatchObject({ state: "disabled" });
  expect(rpc).not.toHaveBeenCalled();
  expect(sandbox.create).not.toHaveBeenCalled();
});

it("resolves the approved image and keeps the seed if lookup fails", async () => {
  const rpc = vi.fn().mockReturnValueOnce(result(NEW)).mockReturnValueOnce(result(null, { code: "offline" }));
  expect(await resolveVercelScannerSnapshot(client(rpc), AbortSignal.timeout(2_000))).toBe(NEW);
  expect(await resolveVercelScannerSnapshot(client(rpc), AbortSignal.timeout(2_000))).toBe(SEED);
});

it("allocates no VM when the configured state is current", async () => {
  const db = client(vi.fn().mockReturnValue(result(null)));
  expect(await refreshVercelScannerSnapshot(db)).toEqual({ state: "current", failed: false });
  expect(sandbox.create).not.toHaveBeenCalled();
});

it("restricts update egress and denies it before publishing", async () => {
  const rpc = vi.fn().mockReturnValueOnce(result(SEED)).mockReturnValueOnce(result(true));
  expect(await refreshVercelScannerSnapshot(client(rpc))).toEqual({ state: "refreshed", failed: false });
  expect(sandbox.create).toHaveBeenCalledWith(expect.objectContaining({
    source: { type: "snapshot", snapshotId: SEED }, ports: [],
    persistent: false, networkPolicy: { allow: ["database.clamav.net", "current.cvd.clamav.net"] },
  }));
  expect(sandbox.updateNetworkPolicy).toHaveBeenCalledWith("deny-all", expect.any(Object));
  expect(sandbox.updateNetworkPolicy.mock.invocationCallOrder[0]).toBeLessThan(sandbox.snapshot.mock.invocationCallOrder[0]);
  expect(rpc).toHaveBeenLastCalledWith("complete_vercel_scanner_snapshot_refresh", expect.objectContaining({
    p_claim_id: rpc.mock.calls[0][1].p_claim_id, p_snapshot_id: NEW,
  }));
  expect(sandbox.stop).toHaveBeenCalledOnce();
});

it("keeps the previous snapshot if the definitions are stale", async () => {
  sandbox.runCommand.mockResolvedValueOnce(receipt(55 * 3600));
  const rpc = vi.fn().mockReturnValue(result(SEED));
  expect(await refreshVercelScannerSnapshot(client(rpc))).toEqual({ state: "stale-definitions", failed: true });
  expect(rpc).toHaveBeenCalledOnce();
  expect(sandbox.snapshot).not.toHaveBeenCalled();
  expect(sandbox.stop).toHaveBeenCalledOnce();
});
