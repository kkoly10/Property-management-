"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type RentalConversationState } from "@/lib/rental-conversation";

export class ConversationRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function conversationRequest(url: string, body?: object) {
  const response = await fetch(url, body ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new ConversationRequestError(
      typeof data?.error === "string" ? data.error : "The conversation response could not be confirmed.", response.status,
    );
  }
  return data;
}

export function RentalConversationThread({
  state, onReply, showQuestion = false,
}: {
  state: RentalConversationState;
  onReply: (body: string, operation: string) => Promise<void>;
  showQuestion?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const operation = useRef<string | null>(null);
  const inputId = `conversation-reply-${state.reference}`;

  async function send() {
    const body = text.trim();
    if (!body || busy || !state.canReply) return;
    setBusy(true);
    setError("");
    operation.current ??= crypto.randomUUID();
    try {
      await onReply(body, operation.current);
      setText("");
      setPending(false);
      operation.current = null;
    } catch (error) {
      const unknownResult = !(error instanceof ConversationRequestError) || error.status >= 500;
      setPending(unknownResult);
      if (!unknownResult) operation.current = null;
      setError(error instanceof Error ? error.message : "Retry the same reply to confirm it was sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {showQuestion && state.originalQuestion ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-semibold">Original question</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{state.originalQuestion}</p>
        </div>
      ) : null}
      {state.messages.length ? (
        <ol className="space-y-2" aria-label="Replies">
          {state.messages.map((message) => (
            <li key={message.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{message.author === "landlord" ? "Landlord" : "Prospective renter"}</span>
                <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
                  {message.createdAt.slice(0, 10)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">There are no replies yet.</p>}
      {state.canReply ? (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <Label htmlFor={inputId}>Reply in Crecy</Label>
          <Textarea id={inputId} value={text} onChange={(event) => setText(event.target.value)}
            maxLength={2000} disabled={busy || pending} aria-describedby={`${inputId}-hint`} />
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">Keep IDs, credit reports, and income documents in the private application.</p>
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            {busy ? "Sending…" : pending ? "Retry same reply" : "Send reply"}
          </Button>
        </form>
      ) : <p className="text-sm text-muted-foreground">This conversation is closed.</p>}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
