import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { recordScheduledRun } from "./heartbeat";

describe("scheduler heartbeat", () => {
  it("records an authenticated scheduler run even when there is nothing due", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const response = await recordScheduledRun({ rpc } as unknown as SupabaseClient, "recurring-charges",
      async () => Response.json({ zonesDue: 0 }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_runtime_heartbeat", {
      p_job: "recurring-charges", p_started_at: expect.any(String), p_status: 200,
    });
  });

  it("preserves a worker exception and records the failed run", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await expect(recordScheduledRun({ rpc } as unknown as SupabaseClient, "document-scans", async () => {
      throw new Error("Worker unavailable");
    })).rejects.toThrow("Worker unavailable");
    expect(rpc).toHaveBeenCalledWith("record_runtime_heartbeat", {
      p_job: "document-scans", p_started_at: expect.any(String), p_status: 500,
    });
  });
});
