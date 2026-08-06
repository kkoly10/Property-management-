"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  personId: string;
  organizationId: string;
  email: string | null;
  invitationState: "active" | "invited" | "not_invited";
  disabled: boolean;
};

export function InviteResidentButton({ personId, organizationId, email, invitationState, disabled }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  if (invitationState === "active") return <Badge variant="info">Portal active</Badge>;

  async function invite() {
    if (disabled || pending || !email) return;
    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, relationshipType: "resident_person", relationshipId: personId, email, locale: "en-US", redirectSurface: "crecy_living" }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The invitation could not be sent."); }
      setSent(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invitation could not be sent.");
    } finally {
      setPending(false);
    }
  }

  if (sent) return <Badge variant="success"><CheckCircle2 className="h-3.5 w-3.5" />Invitation sent</Badge>;

  return <div className="flex flex-col items-end gap-1">
    <Button size="sm" variant={invitationState === "invited" ? "outline" : "default"} disabled={disabled || pending || !email} onClick={invite}>
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : invitationState === "invited" ? <Mail className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {invitationState === "invited" ? "Resend invite" : "Invite to portal"}
    </Button>
    {!email ? <span className="text-xs text-muted-foreground">Add an email to invite</span> : null}
    {error ? <span className="max-w-[220px] text-right text-xs text-destructive">{error}</span> : null}
  </div>;
}
