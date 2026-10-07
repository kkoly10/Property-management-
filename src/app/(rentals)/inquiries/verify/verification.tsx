"use client";

import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Result = { verified: boolean; inquiryReference?: string | null; message?: string };

export function InquiryVerification() {
  const tokenRef = useRef<string | null>(null);
  const [state, setState] = useState<"ready" | "busy" | "success" | "error">("ready");
  const [message, setMessage] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function verify() {
    if (state === "busy" || state === "success") return;
    if (!tokenRef.current) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const candidate = params.get("token")?.trim().toLowerCase() ?? "";
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!/^[0-9a-f]{64}$/.test(candidate)) {
        setState("error");
        setMessage("This verification link is invalid or expired.");
        return;
      }
      tokenRef.current = candidate;
    }
    const token = tokenRef.current;
    setState("busy");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/rental-inquiries/verify", {
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
      setReference(typeof result.inquiryReference === "string" ? result.inquiryReference : null);
      setState("success");
    } catch {
      setState("error");
      setMessage("Verification is temporarily unavailable. You can retry this page.");
    }
  }
  if (state === "success") {
    return (
      <Alert>
        <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
        <AlertTitle>Your question is verified</AlertTitle>
        <AlertDescription>
          The landlord can now see it in Crecy.
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
      <Button type="button" onClick={verify} disabled={state === "busy"}>
        {state === "busy" ? "Verifying…" : "Verify my email"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        This page does not verify automatically. Email-link previews and scanners cannot submit your question by opening the page.
      </p>
    </div>
  );
}
