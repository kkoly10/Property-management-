import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const paths = [
  "../../app/payments/new/page.tsx",
  "../../app/maintenance/page.tsx",
  "../../app/maintenance/new/page.tsx",
  "../../app/maintenance/[requestId]/page.tsx",
  "../../app/messages/page.tsx",
  "../../app/messages/[conversationId]/page.tsx",
  "../../app/documents/page.tsx",
  "../../app/more/preferences/page.tsx",
] as const;

const sources = Object.fromEntries(
  paths.map((path) => [path, readFileSync(resolve(__dirname, path), "utf8")]),
);

const paymentForm = readFileSync(resolve(__dirname, "../../app/payments/new/resident-payment-form.tsx"), "utf8");
const maintenance = sources["../../app/maintenance/page.tsx"];
const maintenanceDetail = sources["../../app/maintenance/[requestId]/page.tsx"];
const documents = sources["../../app/documents/page.tsx"];
const messages = sources["../../app/messages/page.tsx"];

describe("Crecy Living route-family propagation", () => {
  it("uses the shared Living shell instead of page-local headers and bottom navigation", () => {
    for (const source of Object.values(sources)) {
      expect(source).toContain("<LivingShell");
      expect(source).not.toContain('bg-[#f6f8fb]');
      expect(source).not.toContain("<Wordmark");
      expect(source).not.toContain('aria-label="Resident" className="fixed');
    }
  });

  it("keeps the payment journey continuous instead of three generic cards", () => {
    expect(paymentForm).toContain("<PaymentStep");
    expect(paymentForm).not.toMatch(/from ["']@\/components\/ui\/card["']/);
    expect(paymentForm).not.toMatch(/<Card(?:\s|>)/);
    expect(paymentForm).toContain("/api/v1/resident-payment-sessions");
  });

  it("gives maintenance a resident-specific task and progress structure", () => {
    expect(maintenance).not.toMatch(/from ["']@\/components\/ui\/card["']/);
    expect(maintenance).toContain("Your maintenance requests");
    expect(maintenanceDetail).toContain("<LivingRequestProgress");
    expect(maintenanceDetail).not.toMatch(/from ["']@\/components\/ui\/card["']/);
  });

  it("renders resident messages and documents as continuous registers rather than card grids", () => {
    expect(messages).toContain('presentation="living"');
    expect(documents).not.toMatch(/from ["']@\/components\/ui\/card["']/);
    expect(documents).toContain('aria-label="Delivered documents"');
  });

  it("preserves resident-safe read models and command boundaries", () => {
    expect(sources["../../app/payments/new/page.tsx"]).toContain("getResidentPaymentSessionOptions");
    expect(maintenance).toContain("getResidentMaintenanceWorkspace");
    expect(maintenanceDetail).toContain("getResidentMaintenanceDetail");
    expect(messages).toContain("getConversationWorkspace");
    expect(sources["../../app/messages/[conversationId]/page.tsx"]).toContain("getConversationDetail");
    expect(documents).toContain("getRecipientDocumentDeliveries");
    expect(sources["../../app/more/preferences/page.tsx"]).toContain("getNotificationPreferencesWorkspace");
  });
});
