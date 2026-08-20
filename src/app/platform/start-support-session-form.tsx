"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

// Opens an audited, time-boxed support session against a target org. Requires AAL2 step-up + a
// mandatory reason (8–500 chars). Read-only for the pilot.
export function StartSupportSessionForm({ organizationId, disabled }: { organizationId: string; disabled: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    if (reason.trim().length < 8) { setError("Enter a support reason of at least 8 characters."); return; }
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/platform/support-sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, reason: reason.trim(), ttlMinutes, idempotencyKey: idempotencyKey.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        idempotencyKey.current = null;
        // Route an AAL2 step-up back through the existing MFA flow, returning to this org's page.
        if (response.status === 403 && /multi-factor/i.test(body.error ?? "")) {
          window.location.assign(`/settings/security/mfa?returnTo=${encodeURIComponent(`/platform/${organizationId}`)}`);
          return;
        }
        throw new Error(body.error ?? "The support session could not be opened.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The support session could not be opened.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="support-reason">Support reason (required, audited)</Label>
        <Textarea id="support-reason" required minLength={8} maxLength={500} rows={2} value={reason} disabled={disabled || pending}
          placeholder="Investigating a reported issue on ticket #… — describe why this access is needed." onChange={(event) => setReason(event.target.value)} />
      </div>
      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor="support-ttl">Session length</Label>
        <NativeSelect id="support-ttl" value={ttlMinutes} disabled={disabled || pending} onChange={(event) => setTtlMinutes(Number(event.target.value))}>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
          <option value={120}>2 hours</option>
          <option value={240}>4 hours (maximum)</option>
        </NativeSelect>
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>Session not opened</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Open audited support session
      </Button>
      <p className="text-xs text-muted-foreground">Multi-factor step-up is required. The session grants read-only, sanitized diagnostics for this organization and expires automatically.</p>
    </form>
  );
}
