"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Result = {
  verified: boolean;
  accessGranted?: boolean;
  applicationReference?: string | null;
  message?: string;
};

export function ApplicationVerification() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "success" | "error">("loading");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const candidate = fragment.get("token")?.trim().toLowerCase() ?? "";
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!/^[0-9a-f]{64}$/.test(candidate)) {
        setState("error");
        setResult({ verified: false, message: "This verification link is invalid or expired." });
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
    try {
      const response = await fetch("/api/v1/rental-applications/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null) as Result | null;
      setResult(body);
      // A 2xx flag without a canonical application reference and explicit
      // access outcome is not a usable verification receipt. Keep the token
      // for a retry rather than displaying a false success state.
      if (!response.ok || body?.verified !== true
        || typeof body.applicationReference !== "string"
        || !/^APP-[0-9A-F]{12}$/.test(body.applicationReference)
        || typeof body.accessGranted !== "boolean") {
        setState("error");
        return;
      }
      setToken(null);
      setState("success");
    } catch {
      setState("error");
      setResult({ verified: false, message: "Verification is temporarily unavailable. Retry this page." });
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-muted-foreground">Preparing verification…</p>;
  }
  if (state === "success") {
    return (
      <Alert>
        <AlertTitle>{result?.accessGranted ? "Application verified" : "Email already verified"}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{result?.message ?? "Your verification was recorded."}</p>
          {result?.applicationReference ? (
            <p>Reference: <span className="font-mono">{result.applicationReference}</span></p>
          ) : null}
          {result?.applicationReference ? (
            <Button asChild><Link href={`/applications?ref=${encodeURIComponent(result.applicationReference)}`}>
              {result.accessGranted ? "View my application" : "Open status in the original browser"}
            </Link></Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      {state === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Verification not completed</AlertTitle>
          <AlertDescription>{result?.message ?? "This verification link is invalid or expired."}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" disabled={!token || state === "busy"} onClick={verify}>
        {state === "busy" ? "Verifying…" : "Verify my email"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        This page does not verify automatically. Opening an email preview cannot
        submit your application or grant access.
      </p>
    </div>
  );
}
