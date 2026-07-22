import { describe, expect, it } from "vitest";
import { submitMaintenanceRequestSchema } from "./maintenance";

const valid = {
  tenancyId: "20000000-0000-4000-8000-000000000002",
  category: "plumbing",
  title: "Kitchen sink is leaking",
  description: "Water is dripping from the pipe beneath the kitchen sink.",
  priorityRequested: "medium" as const,
  accessPermission: "Call before entering.",
  preferredTimes: [{ start: "2026-07-24T13:00:00-04:00", end: "2026-07-24T16:00:00-04:00" }],
  evidenceDocumentIds: ["30000000-0000-4000-8000-000000000003"],
};

describe("maintenance request validation", () => {
  it("accepts the contracted resident request", () => {
    expect(submitMaintenanceRequestSchema.parse(valid)).toMatchObject({ category: "plumbing", priorityRequested: "medium" });
  });

  it("rejects emergency priority and inverted visit windows", () => {
    expect(submitMaintenanceRequestSchema.safeParse({ ...valid, priorityRequested: "emergency" }).success).toBe(false);
    expect(submitMaintenanceRequestSchema.safeParse({ ...valid, preferredTimes: [{ start: valid.preferredTimes[0].end, end: valid.preferredTimes[0].start }] }).success).toBe(false);
  });

  it("limits evidence to five unique images", () => {
    expect(submitMaintenanceRequestSchema.safeParse({ ...valid, evidenceDocumentIds: Array(6).fill(valid.evidenceDocumentIds[0]) }).success).toBe(false);
    expect(submitMaintenanceRequestSchema.safeParse({ ...valid, evidenceDocumentIds: [valid.evidenceDocumentIds[0], valid.evidenceDocumentIds[0]] }).success).toBe(false);
  });
});
