"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Result = { verified: boolean; tourReference?: string | null; message?: string };

export function TourVerification() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "success" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      const params = new URLSearchParams(window.location.hash.slice(1));
      const candidate = params.get("token")?.trim().toLowerCase() ?? "";
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!/^[0-9a-f]{64}$/.test(candidate)) {
        setState("error");
        setMessage("This verification link is invalid or expired.");
        return;
      }
      setToken(candidate);
      setState("ready");
    });
    return () => { canceled = true; };
  }, []);

  async function verify() {
    if (!token || state === "busy" || state === "success") return;
    setState("busy");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/rental-tours/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => null) as Result | null;
      if (!response.ok) {
        setState("error");
        setMessage(result?.message ?? "Verification is temporarily unavailable.");
        return;
      }
      if (result?.verified !== true) {
        setState("error");
        setMessage(result?.message ?? "This verification link is invalid or expired.");
        return;
      }
      setReference(typeof result.tourReference === "string" ? result.tourReference : null);
      setState("success");
    } catch {
      setState("error");
      setMessage("Verification is temporarily unavailable. You can retry this page.");
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-muted-foreground">Preparing verification…</p>;
  }

  if (state === "success") {
    return (
      <Alert>
        <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
        <AlertTitle>Your tour request is verified</AlertTitle>
        <AlertDescription>
          The landlord can now see your preferred times. Your tour is not confirmed until the landlord confirms one.
          {reference ? <> Reference <span className="font-mono">{reference}</span>.</> : null}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {state === "error" && message ? (
        <Alert variant="destructive">
          <AlertTitle>Verification not completed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" onClick={verify} disabled={!token || state === "busy"}>
        {state === "busy" ? "Verifying…" : "Verify my email"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        This page does not verify automatically. Email-link previews and scanners cannot request a tour by opening the page.
      </p>
    </div>
  );
}
