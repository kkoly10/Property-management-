import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

const statement = source("../../app/owner/statements/[statementId]/page.tsx");
const approval = source("../../app/owner/approvals/[approvalId]/page.tsx");
const approvalForm = source("../../app/owner/approvals/[approvalId]/owner-approval-form.tsx");
const documents = source("../../app/owner/documents/page.tsx");
const messages = source("../../app/owner/messages/page.tsx");
const conversation = source("../../app/owner/messages/[conversationId]/page.tsx");
const preferences = source("../../app/owner/preferences/page.tsx");
const conversationList = source("../../components/messaging/conversation-list.tsx");
const conversationThread = source("../../components/messaging/conversation-thread.tsx");
const preferenceForm = source("../../components/notifications/notification-preferences-form.tsx");
const shell = source("../../components/owner/owner-shell.tsx");

describe("Crecy Owner secondary workspaces", () => {
  it("keeps every secondary route inside the canonical Owner shell", () => {
    for (const route of [statement, approval, documents, messages, conversation, preferences]) {
      expect(route).toContain("<OwnerShell");
      expect(route).not.toContain('bg-[#f6f8fb]');
      expect(route).not.toContain('<header className="border-b bg-white"');
      expect(route).not.toContain("@/components/ui/card");
    }
    expect(shell).toContain('surface="owner"');
    expect(shell).toContain("chromeTitle");
  });

  it("renders statement detail as an immutable financial record, not a KPI card wall", () => {
    expect(statement).toContain("Statement financial summary");
    expect(statement).toContain("Account summary ledger");
    expect(statement).toContain("Recorded remittances");
    expect(statement).toContain("Record integrity");
    expect(statement).toContain("item.sha256Hex");
    expect(statement).toContain("getOwnerStatementDetail(statementId)");
    expect(statement).toContain("/api/v1/owner-statements/${statementId}/export");
    expect(statement).not.toContain("sm:grid-cols-2 lg:grid-cols-5");
  });

  it("renders approvals as a decision dossier while retaining concurrency controls", () => {
    expect(approval).toContain("Work-order decision dossier");
    expect(approval).toContain("Requested scope");
    expect(approval).toContain("Request chronology");
    expect(approval).toContain("Record your decision");
    expect(approval).not.toContain("uppercase tracking-wide");
    expect(approvalForm).toContain("expectedVersion: version");
    expect(approvalForm).toContain('"idempotency-key": idempotencyKey.current');
    expect(approvalForm).toContain("/api/v1/owner-approvals/${approvalRequestId}/decision");
  });

  it("uses continuous Owner registers for documents and messages", () => {
    expect(documents).toContain('aria-label="Owner document register"');
    expect(documents).toContain("getRecipientDocumentDeliveries()");
    expect(documents).toContain("/api/v1/documents/${item.documentId}/download");
    expect(documents).toContain("<DocumentAcknowledgeForm");
    expect(messages).toContain('presentation="owner"');
    expect(conversationList).toContain('aria-label="Owner correspondence register"');
  });

  it("turns the owner thread into correspondence without changing its send contract", () => {
    expect(conversation).toContain('presentation="owner"');
    expect(conversationThread).toContain('aria-label="Owner correspondence"');
    expect(conversationThread).toContain("Correspondence record");
    expect(conversationThread).toContain("/api/v1/conversations/${conversationId}/messages");
    expect(conversationThread).toContain('"Idempotency-Key": idempotencyKey.current');
  });

  it("uses an Owner report layout for the shared user-bound preferences contract", () => {
    expect(preferences).toContain('presentation="owner"');
    expect(preferences).toContain("getNotificationPreferencesWorkspace()");
    expect(preferenceForm).toContain('presentation?: "default" | "owner"');
    expect(preferenceForm).toContain("divide-y overflow-hidden border-y bg-card");
    expect(preferenceForm).toContain('fetch("/api/v1/notification-preferences"');
    expect(preferenceForm).toContain("expectedVersion: profile.version");
  });
});
