import { describe, expect, it } from "vitest";
import { createAndAssignWorkOrderSchema, createVendorSchema, submitMaintenanceRequestSchema, transitionWorkOrderSchema } from "./maintenance";

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

describe("vendor validation", () => {
  const validVendor = { organizationId: "10000000-0000-4000-8000-000000000001", displayName: "Ready Fix Plumbing", email: "dispatch@readyfix.example", phoneE164: "+14045551234" };

  it("accepts a well-formed vendor", () => {
    expect(createVendorSchema.parse(validVendor)).toMatchObject({ displayName: "Ready Fix Plumbing" });
  });

  it("rejects malformed phone numbers", () => {
    expect(createVendorSchema.safeParse({ ...validVendor, phoneE164: "404-555-1234" }).success).toBe(false);
  });
});

describe("work order validation", () => {
  const validWorkOrder = {
    organizationId: "10000000-0000-4000-8000-000000000001",
    maintenanceRequestId: "a0000000-0000-4000-8000-000000000001",
    vendorId: "b0000000-0000-4000-8000-000000000001",
    scope: "Diagnose and repair the kitchen sink leak.",
    estimatedCostMinor: 45000,
    currencyCode: "USD" as const,
    officialPriority: "high" as const,
  };

  it("accepts a well-formed assignment", () => {
    expect(createAndAssignWorkOrderSchema.parse(validWorkOrder)).toMatchObject({ scope: validWorkOrder.scope, ownerApprovalRequired: false });
  });

  it("requires a currency when an estimated cost is given", () => {
    expect(createAndAssignWorkOrderSchema.safeParse({ ...validWorkOrder, currencyCode: undefined }).success).toBe(false);
  });

  it("rejects an inverted visit window", () => {
    const window = { scheduledStart: "2026-07-27T15:00:00-04:00", scheduledEnd: "2026-07-27T13:00:00-04:00" };
    expect(createAndAssignWorkOrderSchema.safeParse({ ...validWorkOrder, ...window }).success).toBe(false);
  });

  it("requires a completion summary and reason on the matching transitions", () => {
    expect(transitionWorkOrderSchema.safeParse({ expectedVersion: 4, transition: "complete" }).success).toBe(false);
    expect(transitionWorkOrderSchema.safeParse({ expectedVersion: 4, transition: "complete", completionSummary: "Replaced the trap." }).success).toBe(true);
    expect(transitionWorkOrderSchema.safeParse({ expectedVersion: 4, transition: "cancel" }).success).toBe(false);
    expect(transitionWorkOrderSchema.safeParse({ expectedVersion: 4, transition: "cancel", reason: "No longer needed." }).success).toBe(true);
  });

  it("requires both ends of a schedule transition's visit window", () => {
    expect(transitionWorkOrderSchema.safeParse({ expectedVersion: 2, transition: "schedule", scheduledStart: "2026-07-27T13:00:00-04:00" }).success).toBe(false);
  });
});
