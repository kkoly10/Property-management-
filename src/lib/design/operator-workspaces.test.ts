import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const property = readFileSync(resolve(__dirname, "../../app/app/properties/[propertyId]/page.tsx"), "utf8");
const payments = readFileSync(resolve(__dirname, "../../app/app/payments/page.tsx"), "utf8");
const maintenance = readFileSync(resolve(__dirname, "../../app/app/maintenance/page.tsx"), "utf8");
const maintenanceDetail = readFileSync(resolve(__dirname, "../../app/app/maintenance/[requestId]/page.tsx"), "utf8");
const assignVendor = readFileSync(resolve(__dirname, "../../app/app/maintenance/[requestId]/assign-vendor-form.tsx"), "utf8");
const workOrderActions = readFileSync(resolve(__dirname, "../../app/app/maintenance/[requestId]/work-order-actions.tsx"), "utf8");
const recordCost = readFileSync(resolve(__dirname, "../../app/app/maintenance/[requestId]/record-cost-form.tsx"), "utf8");

const operatorSurfaces = [property, payments, maintenance, maintenanceDetail, assignVendor, workOrderActions, recordCost];

describe("operator canonical workspace propagation", () => {
  it("does not regress the propagated workspaces into generic Card composition", () => {
    for (const source of operatorSurfaces) {
      expect(source).not.toMatch(/from ["']@\/components\/ui\/card["']/);
      expect(source).not.toMatch(/<Card(?:\s|>)/);
    }
    expect(property).toContain("<WorkspacePanel");
    expect(payments).toContain("<WorkspacePanel");
    expect(maintenance).toContain("<WorkspacePanel");
    expect(maintenanceDetail).toContain("<WorkspacePanel");
  });

  it("gives each operator domain a job-specific structure instead of one repeated template", () => {
    expect(property).toContain("Property foundation");
    expect(property).toContain("<table");
    expect(property).toContain("Residents & leases");

    expect(payments).toContain("Provider settlements");
    expect(payments).toContain("Exception queue");
    expect(payments).toContain("<ResolveExceptionControl");

    expect(maintenance).toContain("<OperatorAttentionRail");
    expect(maintenance).toContain("Intake & triage");
    expect(maintenance).toContain("Request register");

    expect(maintenanceDetail).toContain("Resident report");
    expect(maintenanceDetail).toContain("Work order");
    expect(maintenanceDetail).toContain("<WorkOrderActions");
  });

  it("preserves the authoritative read models and operational controls", () => {
    expect(property).toContain("getPropertyWorkspace");
    expect(payments).toContain("getOperatorPaymentWorkspace");
    expect(maintenance).toContain("getOperatorMaintenanceWorkspace");
    expect(maintenanceDetail).toContain("getOperatorWorkOrderDetail");
    expect(maintenanceDetail).toContain("getOperatorOwnerApprovalWorkspace");

    expect(assignVendor).toContain('fetch("/api/v1/work-orders"');
    expect(workOrderActions).toContain("/api/v1/work-orders/");
    expect(workOrderActions).toContain("/transitions");
    expect(recordCost).toContain("/api/v1/work-orders/");
    expect(recordCost).toContain("/cost");
  });

  it("avoids the old dashboard-template motifs on the propagated pages", () => {
    for (const source of [property, payments, maintenance, maintenanceDetail]) {
      expect(source).not.toMatch(/uppercase tracking-\[0\.14em\]/);
      expect(source).not.toContain("#312e81");
      expect(source).not.toContain("#4F46E5");
      expect(source).not.toContain("#4338ca");
    }
    expect(payments).not.toContain("xl:grid-cols-6");
  });
});
