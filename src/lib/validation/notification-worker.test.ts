import { describe, expect, it } from "vitest";
import { claimedNotificationJobSchema, dispatchNotificationsSchema } from "./notification-worker";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("dispatchNotificationsSchema", () => {
  it("accepts a valid worker run and applies defaults", () => {
    const parsed = dispatchNotificationsSchema.safeParse({ channel: "email", workerRunId: "worker-run-0001" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(25);
      expect(parsed.data.stallMinutes).toBe(30);
    }
  });
  it("rejects in_app, which no outbound transport can send", () => {
    expect(dispatchNotificationsSchema.safeParse({ channel: "in_app", workerRunId: "worker-run-0001" }).success).toBe(false);
  });
  it("rejects a batch size outside 1-200", () => {
    expect(dispatchNotificationsSchema.safeParse({ channel: "email", limit: 0, workerRunId: "worker-run-0001" }).success).toBe(false);
    expect(dispatchNotificationsSchema.safeParse({ channel: "email", limit: 500, workerRunId: "worker-run-0001" }).success).toBe(false);
  });
  it("rejects a short worker run id", () => {
    expect(dispatchNotificationsSchema.safeParse({ channel: "email", workerRunId: "short" }).success).toBe(false);
  });
});

describe("claimedNotificationJobSchema", () => {
  const job = {
    notificationJobId: uuid,
    organizationId: uuid,
    templateCode: "staff_invitation",
    category: null,
    locale: "en-US",
    channel: "email",
    recipientUserId: uuid,
    recipientAddress: "person@example.com",
    payload: { invitationId: uuid },
    attempt: 1,
    maxAttempts: 6,
  };
  it("accepts a claimed job DTO", () => {
    expect(claimedNotificationJobSchema.safeParse(job).success).toBe(true);
  });
  it("accepts a null organization for platform-level mail", () => {
    expect(claimedNotificationJobSchema.safeParse({ ...job, organizationId: null }).success).toBe(true);
  });
  it("rejects an attempt counter below one", () => {
    expect(claimedNotificationJobSchema.safeParse({ ...job, attempt: 0 }).success).toBe(false);
  });
});
