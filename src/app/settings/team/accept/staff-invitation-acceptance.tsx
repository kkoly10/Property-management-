"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, LoaderCircle, LogIn, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type StaffInvitationAcceptanceProps = { token: string | null; signedIn: boolean };

export function StaffInvitationAcceptance({ token, signedIn }: StaffInvitationAcceptanceProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState(false);

  async function accept() {
    if (!token || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/staff/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "The invitation could not be accepted.");
      setComplete(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <Alert variant="destructive"><AlertDescription>The invitation link is incomplete.</AlertDescription></Alert>;
  if (!signedIn) {
    const next = `/settings/team/accept?token=${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4">
        <Alert variant="info"><LogIn className="h-5 w-5" /><AlertDescription>Sign in with the email address that received this invitation. The invitation stays bound to that account.</AlertDescription></Alert>
        <Button asChild><Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in to continue</Link></Button>
      </div>
    );
  }
  if (complete) {
    return (
      <div className="space-y-4">
        <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertDescription>Your staff access is active.</AlertDescription></Alert>
        <Button asChild><Link href="/app">Open command center</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Accepting activates the assigned role, property scopes, access dates, and MFA requirement. The operator can suspend or revoke access later.</p>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button type="button" disabled={busy} onClick={accept}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
        {busy ? "Activating…" : "Accept staff invitation"}
      </Button>
    </div>
  );
}
