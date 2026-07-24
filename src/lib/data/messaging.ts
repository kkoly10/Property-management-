import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/data/maintenance";

export type ConversationSummary = {
  conversationId: string;
  conversationType: "operator_resident" | "operator_owner" | "internal_support";
  subject: string;
  status: "open" | "closed" | "archived";
  version: number;
  propertyId: string | null;
  propertyName: string | null;
  tenancyId: string | null;
  ownerEntityId: string | null;
  audienceLabel: string;
  latestMessage: {
    messageId: string;
    senderType: "member" | "resident" | "owner" | "system";
    bodyText: string;
    sentAt: string;
    isMine: boolean;
  } | null;
  updatedAt: string;
};

export type ConversationMessage = {
  messageId: string;
  senderType: "member" | "resident" | "owner" | "system";
  senderLabel: string;
  bodyText: string;
  status: "sent" | "redacted" | "deleted_by_policy";
  sentAt: string;
  isMine: boolean;
};

export type ConversationDetail = Omit<ConversationSummary, "latestMessage"> & {
  messages: ConversationMessage[];
};

type ConversationWorkspace = {
  mode: DataMode;
  items: ConversationSummary[];
  requestId?: string;
};

const previewConversationId = "f0000000-0000-4000-8000-000000000001";
const previewSummary: ConversationSummary = {
  conversationId: previewConversationId,
  conversationType: "operator_resident",
  subject: "Resident support",
  status: "open",
  version: 3,
  propertyId: "10000000-0000-4000-8000-000000000001",
  propertyName: "Maple Court",
  tenancyId: "20000000-0000-4000-8000-000000000002",
  ownerEntityId: null,
  audienceLabel: "Property management",
  latestMessage: {
    messageId: "f1000000-0000-4000-8000-000000000001",
    senderType: "member",
    bodyText: "We have closed the repair. Let us know if anything changes.",
    sentAt: "2026-07-24T15:40:00Z",
    isMine: false,
  },
  updatedAt: "2026-07-24T15:40:00Z",
};

const previewDetail: ConversationDetail = {
  ...previewSummary,
  messages: [
    {
      messageId: "f1000000-0000-4000-8000-000000000000",
      senderType: "resident",
      senderLabel: "You",
      bodyText: "The kitchen repair is complete. Thank you.",
      status: "sent",
      sentAt: "2026-07-24T15:30:00Z",
      isMine: true,
    },
    {
      ...previewSummary.latestMessage!,
      senderLabel: "Property management",
      status: "sent",
    },
  ],
};

const nullableString = (value: unknown) => value === null || value === undefined ? null : String(value);

function normalizeLatestMessage(value: unknown): ConversationSummary["latestMessage"] {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    messageId: String(item.messageId),
    senderType: String(item.senderType) as ConversationMessage["senderType"],
    bodyText: String(item.bodyText),
    sentAt: String(item.sentAt),
    isMine: Boolean(item.isMine),
  };
}

function normalizeSummary(value: unknown): ConversationSummary {
  const item = value as Record<string, unknown>;
  return {
    conversationId: String(item.conversationId),
    conversationType: String(item.conversationType) as ConversationSummary["conversationType"],
    subject: String(item.subject),
    status: String(item.status) as ConversationSummary["status"],
    version: Number(item.version),
    propertyId: nullableString(item.propertyId),
    propertyName: nullableString(item.propertyName),
    tenancyId: nullableString(item.tenancyId),
    ownerEntityId: nullableString(item.ownerEntityId),
    audienceLabel: String(item.audienceLabel),
    latestMessage: normalizeLatestMessage(item.latestMessage),
    updatedAt: String(item.updatedAt),
  };
}

function normalizeMessage(value: unknown): ConversationMessage {
  const item = value as Record<string, unknown>;
  return {
    messageId: String(item.messageId),
    senderType: String(item.senderType) as ConversationMessage["senderType"],
    senderLabel: String(item.senderLabel),
    bodyText: String(item.bodyText),
    status: String(item.status) as ConversationMessage["status"],
    sentAt: String(item.sentAt),
    isMine: Boolean(item.isMine),
  };
}

function normalizeDetail(value: unknown): ConversationDetail {
  const item = value as Record<string, unknown>;
  const messages = Array.isArray(item.messages) ? item.messages.map(normalizeMessage) : [];
  return {
    ...normalizeSummary({ ...item, latestMessage: null }),
    messages,
  };
}

export async function getConversationWorkspace(): Promise<ConversationWorkspace> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewSummary] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_conversation_workspace");
    if (error || !data) throw error ?? new Error("Messages are unavailable.");
    const items = (data as { items?: unknown[] }).items;
    return { mode: "ready", items: Array.isArray(items) ? items.map(normalizeSummary) : [] };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}

export async function getConversationDetail(conversationId: string): Promise<{ mode: DataMode; item?: ConversationDetail; requestId?: string }> {
  if (!getPublicSupabaseConfig()) {
    return conversationId === previewConversationId
      ? { mode: "setup", item: previewDetail }
      : { mode: "setup" };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_conversation_detail", { p_conversation_id: conversationId });
    if (error || !data) throw error ?? new Error("Conversation unavailable.");
    return { mode: "ready", item: normalizeDetail(data) };
  } catch {
    return { mode: "error", requestId: crypto.randomUUID() };
  }
}
