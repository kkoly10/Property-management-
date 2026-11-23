"use client";

import { useState } from "react";
import { conversationState, type RentalConversationState } from "@/lib/rental-conversation";
import { conversationRequest, RentalConversationThread } from "./rental-conversation-thread";

export function OperatorRentalConversation({
  organizationId, kind, id,
}: { organizationId: string; kind: "inquiry" | "tour"; id: string }) {
  const [thread, setThread] = useState<RentalConversationState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const endpoint = "/api/v1/rental-conversations/manage";

  function receive(value: unknown) {
    const parsed = conversationState.safeParse(value);
    if (!parsed.success) throw new Error("The conversation could not be confirmed.");
    setThread(parsed.data);
  }
  async function open() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, kind, id });
      receive(await conversationRequest(`${endpoint}?${query}`));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reload this conversation to try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="mt-4 space-y-3 rounded-lg border p-3"
      onToggle={(event) => { if (event.currentTarget.open && !loading) void open(); }}>
      <summary className="cursor-pointer text-sm font-semibold text-primary">Conversation in Crecy</summary>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading conversation…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {thread ? <RentalConversationThread state={thread}
        onReply={async (body, operation) => { receive(await conversationRequest(endpoint, { organizationId, kind, id, body, operation })); }} /> : null}
    </details>
  );
}
