"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { createEntityBookAction } from "@/app/onboarding/entity/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/actions/state";

export function EntityBookForm() {
  const [state, action] = useActionState(createEntityBookAction, initialActionState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.status === "error" ? <Alert variant="destructive"><AlertCircle aria-hidden="true" className="h-5 w-5" /><AlertTitle>Entity and book not created</AlertTitle><AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription></Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="legalName">Legal name</Label><Input id="legalName" name="legalName" className="mt-2" placeholder="Northstar Property Management LLC" required /><FieldError messages={state.fieldErrors?.legalName} /></div>
        <div><Label htmlFor="displayName">Display name</Label><Input id="displayName" name="displayName" className="mt-2" placeholder="Northstar PM" required /><FieldError messages={state.fieldErrors?.displayName} /></div>
        <div><Label htmlFor="entityType">Entity type</Label><NativeSelect id="entityType" name="entityType" className="mt-2" defaultValue="company"><option value="company">Company</option><option value="individual">Individual</option><option value="sole_proprietor">Sole proprietor</option><option value="partnership">Partnership</option><option value="trust">Trust</option><option value="other">Other</option></NativeSelect><FieldError messages={state.fieldErrors?.entityType} /></div>
        <div><Label htmlFor="countryCode">Country</Label><NativeSelect id="countryCode" name="countryCode" className="mt-2" defaultValue="US"><option value="US">United States</option><option value="CA">Canada</option><option value="MX">Mexico</option></NativeSelect><FieldError messages={state.fieldErrors?.countryCode} /></div>
        <div><Label htmlFor="currencyCode">Functional currency</Label><NativeSelect id="currencyCode" name="currencyCode" className="mt-2" defaultValue="USD"><option value="USD">USD · US dollar</option><option value="CAD">CAD · Canadian dollar</option><option value="MXN">MXN · Mexican peso</option></NativeSelect><FieldError messages={state.fieldErrors?.currencyCode} /></div>
        <div className="sm:col-span-2"><Label htmlFor="bookName">Accounting book name</Label><Input id="bookName" name="bookName" className="mt-2" placeholder="Virginia operating book" required /><FieldError messages={state.fieldErrors?.bookName} /></div>
      </div>
      <Alert variant="info"><AlertCircle aria-hidden="true" className="h-5 w-5" /><AlertTitle>One currency per book</AlertTitle><AlertDescription>Once the first financial transaction posts, the book currency cannot change. Create a separate book for another currency.</AlertDescription></Alert>
      <div className="flex justify-end"><SubmitButton>Create entity and book</SubmitButton></div>
    </form>
  );
}
