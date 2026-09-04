"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, PenLine } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The resident's response to a delivered document.
 *
 * The delivery is not complete until the resident does something deliberate with it, and there are two
 * honest somethings: agreeing to a document that asks for agreement (a lease, a policy), and simply
 * confirming receipt of one that only informs (a notice). The old form only offered the second, as a
 * single passive click labelled "Acknowledge receipt" — which is not a signature, and cannot stand in
 * for one on a lease.
 *
 * So agreeing now requires an affirmation the resident has to make on purpose: they tick that they have
 * read and agree, and only then can they sign. That tick, the signed timestamp, the recipient's own
 * user id and the document's evidence hash are the click-wrap signature the command records as
 * `accepted`. Receipt stays available as a lighter action for the informational case, recorded as
 * `received`, so a resident is never made to "agree" to a notice they merely need to have seen.
 */
type Outcome = "accepted" | "received";

export function DocumentAcknowledgeForm({
  deliveryId,
  organizationId,
  documentTitle,
  evidenceHash,
  acknowledged,
  acknowledgementType,
  disabled,
}: {
  deliveryId: string;
  organizationId: string;
  documentTitle: string;
  evidenceHash: string | null;
  acknowledged: boolean;
  acknowledgementType: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [affirmed, setAffirmed] = useState(false);
  const [pending, setPending] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Outcome | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const settled = done ?? (acknowledged ? (acknowledgementType === "accepted" ? "accepted" : "received") : null);
  if (settled) {
    return settled === "accepted"
      ? <Badge variant="success" className="gap-1"><PenLine className="h-3.5 w-3.5" />Signed &amp; agreed</Badge>
      : <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Receipt acknowledged</Badge>;
  }

  async function submit(outcome: Outcome) {
    if (!evidenceHash) return;
    // Agreeing is gated on the read affirmation; acknowledging receipt is not.
    if (outcome === "accepted" && !affirmed) return;
    setPending(outcome);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/document-deliveries/${deliveryId}/acknowledgements`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, acknowledgementType: outcome, evidenceHash }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        idempotencyKey.current = null;
        throw new Error(body.error ?? "Your response could not be recorded.");
      }
      setDone(outcome);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your response could not be recorded.");
    } finally {
      setPending(null);
    }
  }

  const busy = disabled || pending !== null || !evidenceHash;

  return <div className="flex w-full flex-col gap-3 sm:max-w-xs">
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={affirmed}
        disabled={busy}
        onChange={(event) => { setAffirmed(event.target.checked); setError(null); }}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
      />
      <span>I have read and agree to <span className="font-medium">{documentTitle}</span>.</span>
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={busy || !affirmed} onClick={() => submit("accepted")}>
        {pending === "accepted" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
        Agree &amp; sign
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => submit("received")}>
        {pending === "received" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Just acknowledge receipt
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">Signing records your name, the document version, and the date.</p>
    {error ? <Alert variant="destructive" className="text-left"><AlertTitle>Not recorded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
  </div>;
}
