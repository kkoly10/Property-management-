"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { createUnitAction } from "@/app/app/properties/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/actions/state";

export function UnitForm({ organizationId, propertyId }: { organizationId: string; propertyId: string }) {
  const [state, action] = useActionState(createUnitAction, initialActionState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.status === "error" ? <Alert variant="destructive"><AlertCircle className="h-5 w-5" /><AlertTitle>Unit not created</AlertTitle><AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="unitCode">Unit code</Label><Input id="unitCode" name="unitCode" className="mt-2" placeholder="101" required /><FieldError messages={state.fieldErrors?.unitCode} /></div>
        <div><Label htmlFor="unitType">Unit type</Label><Input id="unitType" name="unitType" className="mt-2" placeholder="Apartment" /></div>
        <div><Label htmlFor="bedrooms">Bedrooms</Label><Input id="bedrooms" name="bedrooms" type="number" min="0" step="0.5" className="mt-2" /></div>
        <div><Label htmlFor="bathrooms">Bathrooms</Label><Input id="bathrooms" name="bathrooms" type="number" min="0" step="0.5" className="mt-2" /></div>
        <div className="sm:col-span-2"><Label htmlFor="squareFeet">Square feet</Label><Input id="squareFeet" name="squareFeet" type="number" min="0" step="1" className="mt-2" /></div>
      </div>
      <SubmitButton className="w-full">Add unit</SubmitButton>
    </form>
  );
}
