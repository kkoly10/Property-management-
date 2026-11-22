"use client";

import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ApplicationRecoveryForm({ reference }: { reference?: string }) {
  const operationKey = useRef<string | null>(null);
  const [state, setState] = useState<"ready" | "sending" | "accepted" | "error">("ready");
  const [error, setError] = useState("");

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending" || state === "accepted") return;
    const form = new FormData(event.currentTarget);
    operationKey.current ??= crypto.randomUUID();
    setState("sending");
    try {
      const response = await fetch("/api/v1/rental-applications/recover", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": operationKey.current },
        body: JSON.stringify({ reference: form.get("reference"), email: form.get("email") }),
      });
      const result = await response.json().catch(() => null) as { accepted?: unknown; error?: string } | null;
      if (response.status !== 202 || result?.accepted !== true) {
        setError(result?.error ?? "Recovery could not be requested. Try again.");
        setState("error");
        return;
      }
      setState("accepted");
    } catch {
      setError("Recovery could not be requested. Try again.");
      setState("error");
    }
  }

  if (state === "accepted") return <p role="status" className="text-sm">
    If the details match an active application, we’ll send a link. Open it in the browser you want to use.
  </p>;

  return (
    <form className="space-y-4" onSubmit={requestRecovery} onChange={() => {
      operationKey.current = null;
      setState("ready");
    }}>
      <div className="space-y-1">
        <Label htmlFor="recovery-reference">Application reference</Label>
        <Input id="recovery-reference" name="reference" autoComplete="off" autoCapitalize="characters"
          defaultValue={reference} maxLength={16} disabled={state === "sending"} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="recovery-email">Application email</Label>
        <Input id="recovery-email" name="email" type="email" autoComplete="email"
          maxLength={320} disabled={state === "sending"} required />
      </div>
      {state === "error" ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Requesting…" : "Email me a recovery link"}
      </Button>
    </form>
  );
}
