"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { createPropertyAction } from "@/app/onboarding/property/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/actions/state";
import type { AccountingBookOption } from "@/lib/data/portfolio";

const countryDefaults = {
  US: { subdivision: "VA", timeZone: "America/New_York" },
  CA: { subdivision: "ON", timeZone: "America/Toronto" },
  MX: { subdivision: "CMX", timeZone: "America/Mexico_City" },
} as const;

export function PropertyForm({ books }: { books: AccountingBookOption[] }) {
  const [state, action] = useActionState(createPropertyAction, initialActionState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [countryCode, setCountryCode] = useState<keyof typeof countryDefaults>((books[0]?.countryCode as keyof typeof countryDefaults) ?? "US");

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.status === "error" ? <Alert variant="destructive"><AlertCircle aria-hidden="true" className="h-5 w-5" /><AlertTitle>Property not created</AlertTitle><AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription></Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="accountingBookId">Operating entity and accounting book</Label><NativeSelect id="accountingBookId" name="accountingBookId" className="mt-2" required>{books.map((book) => <option key={book.id} value={book.id}>{book.label} · {book.currencyCode}</option>)}</NativeSelect><FieldError messages={state.fieldErrors?.accountingBookId} /></div>
        <div><Label htmlFor="name">Property name</Label><Input id="name" name="name" className="mt-2" placeholder="Maple Court" required /><FieldError messages={state.fieldErrors?.name} /></div>
        <div><Label htmlFor="propertyType">Property type</Label><NativeSelect id="propertyType" name="propertyType" className="mt-2" defaultValue="multifamily"><option value="single_family">Single family</option><option value="multifamily">Multifamily</option><option value="mixed_use">Mixed use</option><option value="student_housing">Student housing</option><option value="other_residential">Other residential</option></NativeSelect></div>
        <div className="sm:col-span-2"><Label htmlFor="addressLine1">Street address</Label><Input id="addressLine1" name="addressLine1" className="mt-2" placeholder="100 Maple Street" required /><FieldError messages={state.fieldErrors?.addressLine1} /></div>
        <div className="sm:col-span-2"><Label htmlFor="addressLine2">Address line 2</Label><Input id="addressLine2" name="addressLine2" className="mt-2" placeholder="Building or suite (optional)" /></div>
        <div><Label htmlFor="locality">City / locality</Label><Input id="locality" name="locality" className="mt-2" placeholder="Richmond" /></div>
        <div><Label htmlFor="subdivisionCode">State / province</Label><Input key={countryCode} id="subdivisionCode" name="subdivisionCode" className="mt-2" defaultValue={countryDefaults[countryCode].subdivision} /></div>
        <div><Label htmlFor="postalCode">Postal code</Label><Input id="postalCode" name="postalCode" className="mt-2" placeholder="23220" /></div>
        <div><Label htmlFor="countryCode">Country</Label><NativeSelect id="countryCode" name="countryCode" className="mt-2" value={countryCode} onChange={(event) => setCountryCode(event.target.value as keyof typeof countryDefaults)}><option value="US">United States</option><option value="CA">Canada</option><option value="MX">Mexico</option></NativeSelect></div>
        <div className="sm:col-span-2"><Label htmlFor="timeZone">Time zone</Label><NativeSelect key={`tz-${countryCode}`} id="timeZone" name="timeZone" className="mt-2" defaultValue={countryDefaults[countryCode].timeZone}><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/Toronto">Toronto</option><option value="America/Vancouver">Vancouver</option><option value="America/Mexico_City">Mexico City</option><option value="America/Tijuana">Tijuana</option></NativeSelect></div>
      </div>
      <div className="flex justify-end"><SubmitButton>Create property</SubmitButton></div>
    </form>
  );
}
