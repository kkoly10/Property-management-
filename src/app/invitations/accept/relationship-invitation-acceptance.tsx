"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, LoaderCircle, LogIn, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Result = { redirectSurface?: "crecy_living" | "crecy_owner" };

export function RelationshipInvitationAcceptance({ token, signedIn }: { token: string | null; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);

  async function accept() {
    if (!token || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "The invitation could not be accepted.");
      setResult(body as Result);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <Alert variant="destructive"><AlertDescription>The invitation link is incomplete.</AlertDescription></Alert>;
  if (!signedIn) {
    const next = `/invitations/accept?token=${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4">
        <Alert variant="info"><LogIn className="h-5 w-5" /><AlertDescription>Sign in with the email address that received this invitation. The invitation stays bound to that account.</AlertDescription></Alert>
        <Button asChild><Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in to continue</Link></Button>
      </div>
    );
  }
  if (result) {
    const owner = result.redirectSurface === "crecy_owner";
    return (
      <div className="space-y-4">
        <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertDescription>Your {owner ? "owner" : "resident"} portal is now active.</AlertDescription></Alert>
        <Button asChild><Link href={owner ? "/owner" : "/home"}>Open your {owner ? "owner portal" : "home"}</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Accepting links this account to the resident or owner record your property team invited. They can revoke access later.</p>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button type="button" disabled={busy} onClick={accept}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
        {busy ? "Activating…" : "Accept invitation"}
      </Button>
    </div>
  );
}
