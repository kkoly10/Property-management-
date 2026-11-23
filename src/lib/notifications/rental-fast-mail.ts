import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { runNotificationDispatch } from "@/lib/runtime/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

type SubmitTarget = { publicId: string; email: string; operationKey: string };

export function scheduleCriticalRentalMail(kind: "agreement" | "job", target: string): void;
export function scheduleCriticalRentalMail(kind: "inquiry" | "tour" | "application", target: SubmitTarget): void;
export function scheduleCriticalRentalMail(
  kind: "agreement" | "job" | "inquiry" | "tour" | "application",
  target: string | SubmitTarget,
): void {
  // Durable delivery remains the scheduled worker's responsibility. This hook only gives one
  // exact job an earlier chance to send, once the originating command has committed.
  if (process.env.NODE_ENV === "test") return;
  try {
    after(async () => {
      try {
        const admin = createAdminClient();
        let jobId: unknown = target;
        if (kind !== "job") {
          const args = typeof target === "string"
            ? { p_kind: kind, p_target_id: target }
            : {
                p_kind: kind, p_target_id: target.publicId,
                p_email: target.email, p_operation_key: target.operationKey,
              };
          const { data, error } = await admin.rpc("locate_rental_fast_mail", args);
          if (error) return;
          jobId = data;
        }
        const exact = z.uuid().safeParse(jobId);
        if (!exact.success) return;
        await runNotificationDispatch(admin, {
          channel: "email", limit: 1, workerRunId: `rental-mail-${crypto.randomUUID()}`,
          stallMinutes: 30, exactJobId: exact.data,
        });
      } catch {
        // No recipient, token, or provider error text is written to logs.
        console.warn("The expedited rental mail attempt deferred to the notification queue");
      }
    });
  } catch {
    // Calls outside a supported Next.js request context still use the normal queue.
  }
}
