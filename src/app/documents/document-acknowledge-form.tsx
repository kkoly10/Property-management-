"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DocumentAcknowledgeForm({
  deliveryId,
  organizationId,
  evidenceHash,
  acknowledged,
  disabled,
}: {
  deliveryId: string;
  organizationId: string;
  evidenceHash: string | null;
  acknowledged: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  if (acknowledged || done) {
    return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Receipt acknowledged</Badge>;
  }

  async function acknowledge() {
    if (!evidenceHash) return;
    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/document-deliveries/${deliveryId}/acknowledgements`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, acknowledgementType: "received", evidenceHash }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        idempotencyKey.current = null;
        throw new Error(body.error ?? "Your acknowledgement could not be recorded.");
      }
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your acknowledgement could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  return <div className="flex flex-col items-end gap-2">
    <Button size="sm" disabled={disabled || pending || !evidenceHash} onClick={acknowledge}>
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Acknowledge receipt
    </Button>
    {error ? <Alert variant="destructive" className="text-left"><AlertTitle>Not recorded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
  </div>;
}
