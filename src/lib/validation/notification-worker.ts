import { z } from "zod";

/** One cron-able worker run: sweep stalled claims, then drain a channel. */
export const dispatchNotificationsSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp", "push"]),
  limit: z.number().int().min(1).max(200).default(25),
  workerRunId: z.string().min(8).max(200),
  stallMinutes: z.number().int().min(1).max(1440).default(30),
});

export type DispatchNotificationsInput = z.infer<typeof dispatchNotificationsSchema>;

/** The claimed-job DTO returned by public.claim_notification_jobs. */
export const claimedNotificationJobSchema = z.object({
  notificationJobId: z.uuid(),
  organizationId: z.uuid().nullable(),
  templateCode: z.string().min(1),
  category: z.string().nullable(),
  locale: z.string().min(2),
  channel: z.string().min(1),
  recipientUserId: z.uuid().nullable(),
  recipientAddress: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
});

export type ClaimedNotificationJob = z.infer<typeof claimedNotificationJobSchema>;
