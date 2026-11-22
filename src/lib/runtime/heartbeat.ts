import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeJob } from "./health";

export async function recordScheduledRun(
  supabase: SupabaseClient,
  job: RuntimeJob,
  run: (client: SupabaseClient) => Promise<Response>,
): Promise<Response> {
  const startedAt = new Date().toISOString();
  let status = 500;
  try {
    const response = await run(supabase);
    status = response.status;
    return response;
  } finally {
    const { error } = await supabase.rpc("record_runtime_heartbeat", {
      p_job: job,
      p_started_at: startedAt,
      p_status: status,
    }).then(result => result, () => ({ error: { code: "HEARTBEAT_REQUEST_FAILED" } }));
    if (error) console.warn("Scheduled run heartbeat could not be recorded", { job, code: error.code });
  }
}
