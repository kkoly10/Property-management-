import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runRecurringChargeGeneration } from "./jobs";
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient;
beforeEach(() => vi.clearAllMocks());
describe("scheduled homeowner rental orchestration", () => {
  it("starts eligible tenancies before evaluating charges with the same instant", async () => {
    rpc.mockResolvedValueOnce({ data: { started: 1, limitReached: false }, error: null })
      .mockResolvedValueOnce({ data: { evaluatedAt: "2026-09-26T12:00:00Z", batches: [{ timeZone: "America/New_York", localDate: "2026-09-26", workerRunId: "due-run", scheduleIds: ["schedule"] }] }, error: null })
      .mockResolvedValueOnce({ data: { generatedCount: 1 }, error: null });
    const result = await runRecurringChargeGeneration(client, { limit: 500 });
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["start_due_homeowner_tenancies", "list_due_charge_schedule_batches", "generate_recurring_charges"]);
    expect(rpc.mock.calls[0][1].p_at).toBe(rpc.mock.calls[1][1].p_at);
    expect(result).toMatchObject({ ok: true, summary: { startedHomeownerTenancies: 1, generatedCharges: 1 } });
  });
  it("reports a start failure instead of marking incomplete work successful", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await runRecurringChargeGeneration(client, { limit: 500 })).toMatchObject({ ok: false, status: 502 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
