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
  const [recovery, setRecovery] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "success" | "error">("loading");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const recoveryToken = fragment.get("recovery");
      const candidate = (recoveryToken ?? fragment.get("token"))?.trim().toLowerCase() ?? "";
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setRecovery(recoveryToken !== null);
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
      const endpoint = recovery ? "/api/v1/rental-applications/recover/confirm" : "/api/v1/rental-applications/verify";
      const response = await fetch(endpoint, {
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
        || typeof body.accessGranted !== "boolean"
        || (recovery && body.accessGranted !== true)) {
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
        <AlertTitle>{recovery ? "Application access recovered" : result?.accessGranted ? "Application verified" : "Email already verified"}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{result?.message ?? "Your verification was recorded."}</p>
          {result?.applicationReference ? (
            <p>Reference: <span className="font-mono">{result.applicationReference}</span></p>
          ) : null}
          {result?.applicationReference ? (
            <Button asChild><Link href={`/applications?ref=${encodeURIComponent(result.applicationReference)}`}>
              {result.accessGranted ? "View my application" : "Open application status"}
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
        {state === "busy" ? "Confirming…" : recovery ? "Recover my access" : "Verify my email"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        {recovery
          ? "Confirming this link moves access to this browser."
          : "Confirming this link shares your application with the landlord and gives you private access to its status."}
      </p>
      {state === "error" ? <Link href="/applications" className="text-sm text-primary underline">Request a new recovery link</Link> : null}
    </div>
  );
}
