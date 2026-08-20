import { z } from "zod";

// Platform support-session lifecycle inputs. Mirrors the RPC contracts in
// 20260727100000_phase_8_platform_support_queries.sql / ..._foundation.sql.
export const startSupportSessionSchema = z.object({
  organizationId: z.uuid(),
  reason: z.string().trim().min(8).max(500),
  ttlMinutes: z.number().int().min(5).max(240),
  idempotencyKey: z.uuid(),
});

export const endSupportSessionSchema = z.object({
  organizationId: z.uuid(),
  disposition: z.enum(["ended", "revoked"]),
  idempotencyKey: z.uuid(),
});

export type StartSupportSessionInput = z.infer<typeof startSupportSessionSchema>;
export type EndSupportSessionInput = z.infer<typeof endSupportSessionSchema>;
