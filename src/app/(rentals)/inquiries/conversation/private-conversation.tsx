"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { conversationRequest, RentalConversationThread } from "@/components/rentals/rental-conversation-thread";
import { ProspectTourActions } from "@/components/rentals/prospect-tour-actions";
import { conversationReference, conversationState, conversationToken, type RentalConversationState } from "@/lib/rental-conversation";

const endpoint = "/api/v1/rental-conversations";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function readHash() { return window.location.hash; }
function serverHash() { return ""; }

export function PrivateRentalConversation({ initialReference }: { initialReference: string }) {
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const token = conversationToken.safeParse(new URLSearchParams(hash.slice(1)).get("token"));
  const [thread, setThread] = useState<RentalConversationState | null>(null);
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function receive(value: unknown) {
    const parsed = conversationState.safeParse(value);
    if (!parsed.success) throw new Error("The conversation could not be confirmed.");
    setThread((current) => current?.reference === parsed.data.reference && current.tour && !parsed.data.tour
      ? { ...parsed.data, tour: current.tour } : parsed.data);
  }

  useEffect(() => {
    if (window.location.hash) return;
    let active = true;
    const query = window.location.search;
    if (!conversationReference.safeParse(new URLSearchParams(query).get("ref")).success) return;
    conversationRequest(endpoint + query).then((value) => {
      if (active && !window.location.hash && window.location.search === query) receive(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function action(kind: "open" | "recover") {
    if (busy || (kind === "open" && !token.success)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (kind === "open" && token.success) {
        const opened = await conversationRequest(endpoint, { action: "open", token: token.data });
        const expected = conversationReference.parse(opened.reference);
        if (readHash() !== hash) return;
        const query = `?ref=${encodeURIComponent(expected)}`;
        setThread(null);
        window.history.replaceState(null, "", window.location.pathname + query);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        const loaded = await conversationRequest(endpoint + query);
        if (!readHash() && window.location.search === query) receive(loaded);
      } else {
        await conversationRequest(endpoint, { action: "recover", email, reference });
        setMessage("If the details match a verified request, Crecy will email a new link.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "This conversation is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      {thread && !token.success ? (
        <>
          <p className="text-sm text-muted-foreground">{thread.reference}</p>
          {thread.tour ? <ProspectTourActions reference={thread.reference} tour={thread.tour} onChange={(tour) => {
            const exact = thread.reference;
            setThread((current) => current?.reference === exact
              ? { ...current, tour, canReply: tour.status !== "cancelled" && current.canReply } : current);
            const query = `?ref=${encodeURIComponent(exact)}`;
            void conversationRequest(endpoint + query).then((value) => {
              if (!readHash() && window.location.search === query) receive(value);
            }).catch(() => {});
          }} /> : null}
          <RentalConversationThread key={thread.reference} state={thread} showQuestion
            onReply={async (body, operation) => {
              const updated = await conversationRequest(endpoint, { action: "reply", body, operation, reference: thread.reference });
              if (!readHash() && new URLSearchParams(window.location.search).get("ref") === thread.reference) receive(updated);
            }} />
        </>
      ) : (
        <>
          {token.success ? (
            <Button type="button" onClick={() => { void action("open"); }} disabled={busy}>Open private conversation</Button>
          ) : null}
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void action("recover"); }}>
            <p className="text-sm text-muted-foreground">Use the request reference and the email address you verified to get a new link.</p>
            <div><Label htmlFor="conversation-reference">Request reference</Label>
              <Input id="conversation-reference" required maxLength={17} value={reference} onChange={(event) => setReference(event.target.value)} /></div>
            <div><Label htmlFor="conversation-email">Email address</Label>
              <Input id="conversation-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <Button type="submit" variant="outline" disabled={busy}>Email me a new link</Button>
          </form>
        </>
      )}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
