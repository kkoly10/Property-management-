"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/actions/state";
import { requestPasswordRecovery, resetPassword } from "./actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordRecovery, initialActionState);
  return (
    <form className="mt-6 space-y-5" action={action}>
      {state.message ? (
        <Alert variant={state.status === "success" ? "success" : "destructive"} role="status">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="recovery-email">Email</Label>
        <Input id="recovery-email" name="email" type="email" autoComplete="email" required />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ flowId }: { flowId: string }) {
  const [state, action] = useActionState(resetPassword, initialActionState);
  return (
    <form className="mt-6 space-y-5" action={action}>
      <input type="hidden" name="flowId" value={flowId} />
      {state.message ? (
        <Alert variant="destructive" role="alert"><AlertDescription>{state.message}</AlertDescription></Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" autoComplete="new-password" name="password" type="password" minLength={10} required />
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input id="confirm-password" autoComplete="new-password" name="confirmPassword" type="password" required />
        <FieldError messages={state.fieldErrors?.confirmPassword} />
      </div>
      <SubmitButton className="w-full">Update password</SubmitButton>
    </form>
  );
}
