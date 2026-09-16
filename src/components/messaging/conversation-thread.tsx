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
  presentation = "default",
}: {
  conversationId: string;
  messages: ConversationMessage[];
  disabled: boolean;
  presentation?: "default" | "owner";
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

  if (presentation === "owner") {
    return (
      <section aria-label="Owner correspondence" className="overflow-hidden border-y bg-card sm:rounded-xl sm:border">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Correspondence record</h2>
            <p className="mt-1 text-xs text-muted-foreground">Messages visible to this owner relationship.</p>
          </div>
          <p className="text-xs text-muted-foreground">{messages.length} {messages.length === 1 ? "message" : "messages"}</p>
        </header>

        <div aria-live="polite" className="divide-y">
          {messages.length ? messages.map((message) => (
            <article
              key={message.messageId}
              className={`grid gap-3 px-5 py-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:px-6 ${message.isMine ? "border-l-[3px] border-l-primary" : ""}`}
            >
              <div>
                <p className="text-sm font-semibold">{message.senderLabel}</p>
                <time className="mt-1 block text-xs leading-5 text-muted-foreground">{timestamp(message.sentAt)}</time>
              </div>
              <div className="min-w-0">
                <p className="whitespace-pre-wrap text-sm leading-6">{message.bodyText}</p>
                {message.status !== "sent" ? <p className="mt-2 text-xs text-muted-foreground">{message.status.replaceAll("_", " ")}</p> : null}
              </div>
            </article>
          )) : <p className="px-5 py-10 text-sm text-muted-foreground sm:px-6">No messages have been recorded. Start the correspondence below.</p>}
        </div>

        {error ? <div className="border-t px-5 py-4 sm:px-6"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></div> : null}

        <form className="border-t bg-[var(--surface-subtle)]/45 px-5 py-5 sm:px-6" onSubmit={sendMessage}>
          <label htmlFor="owner-correspondence-message" className="text-sm font-semibold">Reply to the property team</label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Your reply becomes part of this owner correspondence record.</p>
          <Textarea
            id="owner-correspondence-message"
            disabled={disabled || busy}
            maxLength={10_000}
            placeholder={disabled ? "This conversation is closed." : "Write a reply…"}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            className="mt-4 min-h-28 resize-y bg-card"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{bodyText.length.toLocaleString()} / 10,000</p>
            <Button type="submit" disabled={disabled || busy || !bodyText.trim()}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </form>
      </section>
    );
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
