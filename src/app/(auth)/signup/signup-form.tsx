"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { signupAction } from "@/app/(auth)/signup/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/actions/state";

export function SignupForm() {
  const [state, action] = useActionState(signupAction, initialActionState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>We could not create your account</AlertTitle>
          <AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" className="mt-2" placeholder="you@company.com" required />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <div>
        <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><span className="text-xs text-muted-foreground">10+ characters</span></div>
        <Input id="password" name="password" type="password" autoComplete="new-password" className="mt-2" required />
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <SubmitButton className="w-full">Create account</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">Already have access? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>
    </form>
  );
}
