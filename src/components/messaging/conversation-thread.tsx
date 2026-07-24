"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ConversationMessage } from "@/lib/data/messaging";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const timestamp = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value));

export function ConversationThread({
  conversationId,
  messages,
  disabled,
}: {
  conversationId: string;
  messages: ConversationMessage[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [bodyText, setBodyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const idempotencyKey = useRef(crypto.randomUUID());

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bodyText.trim() || busy || disabled) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ bodyText }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "The message could not be sent.");
      setBodyText("");
      idempotencyKey.current = crypto.randomUUID();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="space-y-3">
        {messages.length ? messages.map((message) => (
          <div key={message.messageId} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${message.isMine ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
              <div className={`flex items-center gap-2 text-xs ${message.isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                <span className="font-medium">{message.senderLabel}</span>
                <span>{timestamp(message.sentAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.bodyText}</p>
            </div>
          </div>
        )) : <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Start the conversation below.</p>}
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <form className="rounded-xl border bg-card p-3 shadow-xs" onSubmit={sendMessage}>
        <Textarea
          aria-label="Message"
          disabled={disabled || busy}
          maxLength={10_000}
          placeholder={disabled ? "This conversation is closed." : "Write a message…"}
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
          className="min-h-24 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{bodyText.length.toLocaleString()} / 10,000</p>
          <Button type="submit" disabled={disabled || busy || !bodyText.trim()}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

