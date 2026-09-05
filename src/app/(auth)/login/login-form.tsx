"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { loginAction, requestSignInLinkAction } from "@/app/(auth)/login/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/actions/state";

/**
 * Two ways in, because one of them was impossible for a whole class of user.
 *
 * Residents and owners are created by the invitation route with `email_confirm: false` and no
 * password, and this application has no reset route — so a password-only form meant an invited person
 * whose one-time magic link had expired could never reach their portal again, and the operator had to
 * re-invite them. The link option is what makes a 72-hour invitation redeemable for 72 hours.
 */
export function LoginForm({ next, emailLabel, showTrialLink }: { next?: string; emailLabel: string; showTrialLink: boolean }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [state, action] = useActionState(loginAction, initialActionState);
  const [linkState, linkAction] = useActionState(requestSignInLinkAction, initialActionState);
  // No client-side default: an absent `next` is resolved on the server from the request host, so a
  // resident is never handed the operator workspace as a landing page.
  const target = next ?? "";

  if (mode === "link") {
    return (
      <form action={linkAction} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={target} />
        {linkState.status === "success" ? (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>{linkState.message}</AlertDescription>
          </Alert>
        ) : null}
        {linkState.status === "error" ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>We could not send the link</AlertTitle>
            <AlertDescription>{linkState.message}</AlertDescription>
          </Alert>
        ) : null}
        <div>
          <Label htmlFor="link-email">Email</Label>
          <Input id="link-email" name="email" type="email" autoComplete="email" className="mt-2" required />
          <FieldError messages={linkState.fieldErrors?.email} />
          <p className="mt-2 text-sm text-muted-foreground">Use the address your invitation was sent to.</p>
        </div>
        <SubmitButton className="w-full"><Mail className="h-4 w-4" />Email me a sign-in link</SubmitButton>
        <p className="text-center text-sm text-muted-foreground">
          <button type="button" onClick={() => setMode("password")} className="font-semibold text-primary hover:underline">Sign in with a password instead</button>
        </p>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={target} />
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>We could not sign you in</AlertTitle>
          <AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Label htmlFor="email">{emailLabel}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" className="mt-2" required />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" className="mt-2" required />
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <SubmitButton className="w-full">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        <button type="button" onClick={() => setMode("link")} className="font-semibold text-primary hover:underline">Email me a sign-in link instead</button>
      </p>
      {showTrialLink ? (
        <p className="text-center text-sm text-muted-foreground">Need an account? <Link href="/signup" className="font-semibold text-primary hover:underline">Start a trial</Link></p>
      ) : null}
    </form>
  );
}
