"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INVITATION_DELIVERY_COPY } from "@/lib/notifications/delivery-copy";
import type { InvitationDeliveryState } from "@/lib/data/invitation-delivery";

type Props = {
  ownerEntityId: string;
  organizationId: string;
  email: string | null;
  invitationState: "active" | "invited" | "not_invited";
  /** Whether the pending invitation's email left. Null when there is no pending invitation. */
  invitationDelivery: InvitationDeliveryState | null;
  disabled: boolean;
};

export function InviteOwnerButton({ ownerEntityId, organizationId, email, invitationState, invitationDelivery, disabled }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [alreadyActive, setAlreadyActive] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  if (invitationState === "active" || alreadyActive) return <Badge variant="info">Portal active</Badge>;

  async function invite() {
    if (disabled || pending || !email) return;
    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, relationshipType: "owner_entity", relationshipId: ownerEntityId, email, locale: "en-US", redirectSurface: "crecy_owner" }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) {
        // A caller with owner.manage but not organization.manage cannot read user_relationships,
        // so the workspace may show "not invited" for an already-active owner. Reflect the truth.
        if (body.code === "RELATIONSHIP_ALREADY_ACTIVE") { setAlreadyActive(true); router.refresh(); return; }
        idempotencyKey.current = null;
        throw new Error(body.error ?? "The invitation could not be created.");
      }
      setSent(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invitation could not be created.");
    } finally {
      setPending(false);
    }
  }

  // Queued, not sent: the route records the invitation and queues its email for the notification
  // worker, which is the only thing that can report an actual delivery.
  if (sent) return <Badge variant="success"><CheckCircle2 className="h-3.5 w-3.5" />Invitation queued</Badge>;

  // After a refresh the operator needs the state the WORKER reached, not the optimistic one this
  // component set. "Invited" only says a record exists; an invitation whose email dead-lettered will
  // never be accepted and otherwise looks identical to one sitting unread in an inbox.
  const delivery = invitationState === "invited" && invitationDelivery
    ? INVITATION_DELIVERY_COPY[invitationDelivery]
    : null;

  return <div className="flex flex-col items-end gap-1">
    {delivery && <Badge variant={delivery.variant} title={delivery.hint}>{delivery.label}</Badge>}
    <Button size="sm" variant={invitationState === "invited" ? "outline" : "default"} disabled={disabled || pending || !email} onClick={invite}>
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : invitationState === "invited" ? <Mail className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {invitationState === "invited" ? "Resend owner invite" : "Invite owner to portal"}
    </Button>
    {!email ? <span className="text-xs text-muted-foreground">Add an email to invite</span> : null}
    {error ? <span className="max-w-[220px] text-right text-xs text-destructive">{error}</span> : null}
  </div>;
}
