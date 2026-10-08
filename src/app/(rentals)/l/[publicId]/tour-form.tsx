"use client";

import { useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Fields = {
  firstName: string;
  lastName: string;
  email: string;
  preferences: [string, string, string];
};
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function RentalTourForm({ publicId, timeZone }: { publicId: string; timeZone: string }) {
  const [fields, setFields] = useState<Fields>({
    firstName: "", lastName: "", email: "", preferences: ["", "", ""],
  });
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; body: unknown } | null>(null);
  const locked = busy || uncertain || sent;

  function edit(key: "firstName" | "lastName" | "email", value: string) {
    if (locked) return;
    operation.current = null;
    setFields((current) => ({ ...current, [key]: value }));
    setError(null);
  }
  function editPreference(index: number, value: string) {
    if (locked) return;
    operation.current = null;
    setFields((current) => {
      const preferences: Fields["preferences"] = [...current.preferences];
      preferences[index] = value;
      return { ...current, preferences };
    });
    setError(null);
  }

  async function submit() {
    if (busy || sent || (uncertain && !operation.current)) return;
    setBusy(true); setError(null);
    try {
      operation.current ??= {
        key: crypto.randomUUID(),
        body: {
          publicId,
          firstName: fields.firstName,
          lastName: fields.lastName,
          email: fields.email,
          preferences: fields.preferences.filter(Boolean),
          locale: "en-US",
        },
      };
      const current = operation.current;
      const response = await fetch("/api/v1/rental-tours", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) {
        throw new RequestFailure(
          typeof body?.error === "string" ? body.error : "Your tour request could not be submitted.",
          response.status,
        );
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
      setError(caught instanceof Error ? caught.message : "Your tour request could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Alert>
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>
          Verify your email before the tour request is shared. A requested time is not confirmed until the landlord confirms it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Tour request not confirmed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {uncertain ? (
        <Alert>
          <AlertTitle>Confirm the previous submission</AlertTitle>
          <AlertDescription>
            The response was interrupted. Retry the same tour request before editing so Crecy does not create a duplicate.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tour-first-name">First name</Label>
          <Input id="tour-first-name" className="mt-2" autoComplete="given-name"
            value={fields.firstName} disabled={locked} onChange={(e) => edit("firstName", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="tour-last-name">Last name</Label>
          <Input id="tour-last-name" className="mt-2" autoComplete="family-name"
            value={fields.lastName} disabled={locked} onChange={(e) => edit("lastName", e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="tour-email">Email</Label>
        <Input id="tour-email" className="mt-2" type="email" autoComplete="email"
          value={fields.email} disabled={locked} onChange={(e) => edit("email", e.target.value)} />
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Preferred tour times</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Choose up to three. Crecy interprets them in the rental&apos;s time zone: <span className="font-medium">{timeZone}</span>.
          </p>
        </div>
        {fields.preferences.map((value, index) => (
          <div key={index}>
            <Label htmlFor={`tour-time-${index}`}>Preferred time {index + 1}{index === 0 ? "" : " (optional)"}</Label>
            <Input id={`tour-time-${index}`} className="mt-2" type="datetime-local"
              value={value} disabled={locked} onChange={(e) => editPreference(index, e.target.value)} />
          </div>
        ))}
      </div>

      <Button type="button" onClick={submit} disabled={busy || sent}>
        <CalendarPlus aria-hidden="true" className="h-4 w-4" />
        {uncertain ? "Retry same tour request" : busy ? "Sending…" : "Request a tour"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Tour requests are 30 minutes. Verifying your email does not confirm a time, reserve the rental,
        approve an application, or guarantee availability.
      </p>
    </div>
  );
}
