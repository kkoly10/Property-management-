"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Fields = {
  firstName: string; lastName: string; email: string; desiredMoveInOn: string;
  leaseTermText: string; applicantNote: string;
};
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function RentalApplicationForm({ publicId, availableOn, latestMoveInOn }: {
  publicId: string; availableOn: string; latestMoveInOn: string;
}) {
  const [fields, setFields] = useState<Fields>({
    firstName: "", lastName: "", email: "", desiredMoveInOn: availableOn,
    leaseTermText: "", applicantNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; body: unknown } | null>(null);
  const locked = busy || sent || uncertain;
  function edit(key: keyof Fields, value: string) {
    if (locked) return;
    operation.current = null;
    setFields((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function submit() {
    if (busy || sent) return;
    setBusy(true);
    setError(null);
    try {
      operation.current ??= {
        key: crypto.randomUUID(),
        body: { publicId, ...fields, locale: "en-US" },
      };
      const current = operation.current;
      const response = await fetch("/api/v1/rental-applications", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const body = await response.json().catch(() => null) as { accepted?: unknown; error?: unknown } | null;
      if (!response.ok) {
        throw new RequestFailure(
          typeof body?.error === "string" ? body.error : "Application could not be submitted.",
          response.status,
        );
      }
      // A 2xx (including HTML redirects or an incomplete backend envelope)
      // is not proof that the application was accepted. Preserve the original
      // body and idempotency key until a positive 202 receipt arrives.
      if (response.status !== 202 || body?.accepted !== true) {
        throw new RequestFailure("Application acceptance could not be confirmed. Retry the same request.", 502);
      }
      operation.current = null;
      setUncertain(false);
      setSent(true);
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        operation.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }
      setError(caught instanceof Error ? caught.message : "Application response was interrupted.");
    } finally {
      setBusy(false);
    }
  }
  if (availableOn > latestMoveInOn) return (
    <Alert>
      <AlertTitle>Applications are not yet available</AlertTitle>
      <AlertDescription>The advertised availability date is more than a year away. Ask the landlord about when applications will open.</AlertDescription>
    </Alert>
  );
  if (sent) return (
    <Alert>
      <AlertTitle>Check your email</AlertTitle>
      <AlertDescription>Verify your email to share the application with the landlord. Applying does not reserve the rental.</AlertDescription>
    </Alert>
  );
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Application not confirmed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {uncertain ? (
        <Alert>
          <AlertTitle>Retry the same application</AlertTitle>
          <AlertDescription>The response was interrupted. Retry the original request before editing to avoid duplicates.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="application-first">First name</Label>
          <Input className="mt-2" id="application-first" autoComplete="given-name" required maxLength={80}
            value={fields.firstName} disabled={locked} onChange={(e) => edit("firstName", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="application-last">Last name</Label>
          <Input className="mt-2" id="application-last" autoComplete="family-name" required maxLength={80}
            value={fields.lastName} disabled={locked} onChange={(e) => edit("lastName", e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="application-email">Email address</Label>
        <Input className="mt-2" id="application-email" type="email" autoComplete="email" required maxLength={320}
          value={fields.email} disabled={locked} onChange={(e) => edit("email", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="application-move-in">Desired move-in date</Label>
        <Input className="mt-2" id="application-move-in" type="date" required min={availableOn} max={latestMoveInOn}
          value={fields.desiredMoveInOn} disabled={locked} onChange={(e) => edit("desiredMoveInOn", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="application-term">Preferred lease term (optional)</Label>
        <Input className="mt-2" id="application-term" maxLength={300}
          value={fields.leaseTermText} disabled={locked} onChange={(e) => edit("leaseTermText", e.target.value)}
          placeholder="For example, 12 months" />
      </div>
      <div>
        <Label htmlFor="application-note">Note to landlord (optional)</Label>
        <Textarea className="mt-2 min-h-24" id="application-note" maxLength={2000}
          value={fields.applicantNote} disabled={locked} onChange={(e) => edit("applicantNote", e.target.value)}
          placeholder="Share a question or move-in preference." />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Do not include identity numbers, banking information, health information,
        or other sensitive details. No application fee or screening is collected here.
      </p>
      <Button type="submit" disabled={busy || sent}>
        {uncertain ? "Retry same application" : busy ? "Sending…" : "Submit my application"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Verification confirms email control only. The landlord decides whether to
        prepare a lease; a signed agreement is still required.
      </p>
    </form>
  );
}
