"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { revokeOtherSessionsAction } from "./actions";

export function RevokeSessionsForm({ sessionId, verificationHref }: { sessionId: string; verificationHref: string }) {
  const [state, submit, pending] = useActionState(revokeOtherSessionsAction, "idle");
  if (state === "revoked") return <Alert variant="success">
    <AlertTitle>Other sessions revoked</AlertTitle>
    <AlertDescription>This browser is still signed in.</AlertDescription>
  </Alert>;

  if (state === "verification_required") return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Your security check expired. Verify again to continue.</p>
    <Button asChild><Link href={verificationHref}>Verify with your authenticator</Link></Button>
  </div>;

  const message = {
    confirmation_required: "Confirm that you want to sign out of the other sessions.",
    session_changed: "This browser session changed. Refresh before confirming.",
    signed_out: "Your session expired. Sign in again to continue.",
    unavailable: "Crecy could not confirm revocation. Try again.",
  } as Record<string, string>;

  return <form action={submit} className="space-y-4">
    <input type="hidden" name="sessionId" value={sessionId} />
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="confirmation" value="revoke" required disabled={pending} className="mt-1" />
      Sign out other browsers and devices for my account.
    </label>
    {Object.hasOwn(message, state) && <Alert variant="destructive"><AlertDescription>{message[state]}</AlertDescription></Alert>}
    <Button variant="destructive" type="submit" disabled={pending}>
      {pending ? "Signing out other sessions…" : "Sign out other sessions"}
    </Button>
  </form>;
}
