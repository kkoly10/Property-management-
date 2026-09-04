"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Send, X } from "lucide-react";
import type { DeliveryRecipient } from "@/lib/data/documents";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type Channel = "portal" | "email";

/**
 * Puts a clean document in front of a resident or owner so they can open and sign it. This is the step
 * that closes the loop between an operator uploading a policy and a resident signing it — without it the
 * recipient never sees the document. Delivery is only offered once malware scanning has passed (the
 * parent renders this only for `clean` versions), and only to people with active portal access, since
 * `deliver_document` resolves the recipient through their active relationship.
 */
export function DocumentDeliverForm({
  organizationId,
  documentVersionId,
  documentTitle,
  recipients,
  disabled,
}: {
  organizationId: string;
  documentVersionId: string;
  documentTitle: string;
  recipients: DeliveryRecipient[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipientKey, setRecipientKey] = useState("");
  const [channel, setChannel] = useState<Channel>("portal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveredTo, setDeliveredTo] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const residents = useMemo(() => recipients.filter((recipient) => recipient.kind === "Resident"), [recipients]);
  const owners = useMemo(() => recipients.filter((recipient) => recipient.kind === "Owner"), [recipients]);
  const selected = useMemo(() => recipients.find((recipient) => `${recipient.relationshipType}:${recipient.relationshipId}` === recipientKey) ?? null, [recipients, recipientKey]);
  const emailUnavailable = channel === "email" && selected !== null && !selected.hasEmail;

  function reset() { idempotencyKey.current = null; setError(null); }

  if (deliveredTo) {
    return <div className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />Delivered to {deliveredTo}</div>;
  }

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
      <Send className="h-4 w-4" />Deliver
    </Button>;
  }

  async function deliver() {
    if (!selected) { setError("Choose who should receive this document."); return; }
    if (emailUnavailable) { setError("This recipient has no email on file. Deliver to their portal instead."); return; }
    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/document-deliveries", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          organizationId,
          documentVersionId,
          recipientRelationshipType: selected.relationshipType,
          recipientRelationshipId: selected.relationshipId,
          deliveryChannel: channel,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        idempotencyKey.current = null;
        throw new Error(body.error ?? "The document could not be delivered.");
      }
      setDeliveredTo(selected.label);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The document could not be delivered.");
    } finally {
      setPending(false);
    }
  }

  return <div className="w-full space-y-3 rounded-lg border bg-muted/30 p-3 sm:w-80">
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold">Deliver document</p>
      <button type="button" aria-label="Close" className="text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); reset(); }}><X className="h-4 w-4" /></button>
    </div>
    <p className="truncate text-xs text-muted-foreground">{documentTitle}</p>
    <div className="space-y-1.5">
      <Label htmlFor={`recipient-${documentVersionId}`}>Recipient</Label>
      <NativeSelect id={`recipient-${documentVersionId}`} value={recipientKey} disabled={pending} onChange={(event) => { setRecipientKey(event.target.value); reset(); }}>
        <option value="" disabled>Select a recipient…</option>
        {residents.length ? <optgroup label="Residents">{residents.map((recipient) => <option key={`${recipient.relationshipType}:${recipient.relationshipId}`} value={`${recipient.relationshipType}:${recipient.relationshipId}`}>{recipient.label}</option>)}</optgroup> : null}
        {owners.length ? <optgroup label="Owners">{owners.map((recipient) => <option key={`${recipient.relationshipType}:${recipient.relationshipId}`} value={`${recipient.relationshipType}:${recipient.relationshipId}`}>{recipient.label}</option>)}</optgroup> : null}
      </NativeSelect>
      {recipients.length === 0 ? <p className="text-xs text-muted-foreground">No one has active portal access yet. Invite a resident or owner first.</p> : null}
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`channel-${documentVersionId}`}>How to send</Label>
      <NativeSelect id={`channel-${documentVersionId}`} value={channel} disabled={pending} onChange={(event) => { setChannel(event.target.value as Channel); reset(); }}>
        <option value="portal">In their portal</option>
        <option value="email">Email a secure notification</option>
      </NativeSelect>
      {emailUnavailable ? <p className="text-xs text-warning">This recipient has no email on file. Use their portal instead.</p> : null}
    </div>
    {disabled ? <p className="text-xs text-muted-foreground">Delivery becomes available once this workspace is connected.</p> : null}
    {error ? <Alert variant="destructive"><AlertTitle>Not delivered</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={disabled || pending || !selected || emailUnavailable || recipients.length === 0} onClick={deliver}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
    </div>
  </div>;
}
