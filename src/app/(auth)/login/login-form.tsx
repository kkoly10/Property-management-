"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { loginAction } from "@/app/(auth)/login/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/actions/state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialActionState);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? "/app"} />
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>We could not sign you in</AlertTitle>
          <AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" className="mt-2" required />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" className="mt-2" required />
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <SubmitButton className="w-full">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">Need an account? <Link href="/signup" className="font-semibold text-primary hover:underline">Start a trial</Link></p>
    </form>
  );
}
