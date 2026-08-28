"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { createOrganizationAction } from "@/app/onboarding/organization/actions";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/actions/state";

export type ConsentDocumentSummary = {
  code: string;
  title: string;
  version: string;
  effectiveDate: string;
  route: string;
  state: string;
};

export function OrganizationForm({
  consentDocuments,
  consentVersion,
  consentBlockedReason,
}: {
  consentDocuments: ConsentDocumentSummary[];
  consentVersion: string | null;
  consentBlockedReason: string | null;
}) {
  const [state, action] = useActionState(createOrganizationAction, initialActionState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const draftDocuments = consentDocuments.filter((document) => document.state !== "published");
  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {consentVersion ? <input type="hidden" name="consentVersion" value={consentVersion} /> : null}
      {consentBlockedReason ? (
        <Alert variant="destructive" data-testid="consent-blocked">
          <AlertCircle aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Workspace creation is unavailable</AlertTitle>
          <AlertDescription>
            Crecy&rsquo;s binding legal documents are not published on this deployment, so no workspace can be
            created here. This is a configuration gate, not a problem with your details.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "error" ? <Alert variant="destructive"><AlertCircle aria-hidden="true" className="h-5 w-5" /><AlertTitle>Workspace not created</AlertTitle><AlertDescription>{state.message}{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription></Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="displayName">Workspace name</Label><Input id="displayName" name="displayName" className="mt-2" placeholder="Northstar Property Group" required /><FieldError messages={state.fieldErrors?.displayName} /></div>
        <div className="sm:col-span-2"><Label htmlFor="slug">Workspace URL</Label><div className="mt-2 flex rounded-md border border-input bg-card shadow-xs focus-within:ring-2 focus-within:ring-ring/30"><span className="flex items-center border-r px-3 text-sm text-muted-foreground">app.crecy.com/</span><input id="slug" name="slug" className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" placeholder="northstar" required /></div><FieldError messages={state.fieldErrors?.slug} /></div>
        <div><Label htmlFor="customerPath">How you operate</Label><NativeSelect id="customerPath" name="customerPath" className="mt-2" defaultValue="property_manager"><option value="property_manager">Property manager</option><option value="self_managing">Self-managing owner</option></NativeSelect><FieldError messages={state.fieldErrors?.customerPath} /></div>
        <div><Label htmlFor="headquartersCountryCode">Headquarters country</Label><NativeSelect id="headquartersCountryCode" name="headquartersCountryCode" className="mt-2" defaultValue="US"><option value="US">United States</option><option value="CA">Canada</option><option value="MX">Mexico</option></NativeSelect><FieldError messages={state.fieldErrors?.headquartersCountryCode} /></div>
        <div><Label htmlFor="defaultLocale">Default language</Label><NativeSelect id="defaultLocale" name="defaultLocale" className="mt-2" defaultValue="en-US"><option value="en-US">English (United States)</option><option value="es-MX">Español (México)</option><option value="en-CA">English (Canada)</option><option value="fr-CA">Français (Canada)</option></NativeSelect><FieldError messages={state.fieldErrors?.defaultLocale} /></div>
        <div><Label htmlFor="defaultTimeZone">Time zone</Label><NativeSelect id="defaultTimeZone" name="defaultTimeZone" className="mt-2" defaultValue="America/New_York"><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/Toronto">Toronto</option><option value="America/Mexico_City">Mexico City</option></NativeSelect><FieldError messages={state.fieldErrors?.defaultTimeZone} /></div>
      </div>
      {/* The checkbox names the exact artifacts and versions being accepted, and links to each one.
          It previously said "the Terms" and "the Privacy Notice" while linking to nothing at all. */}
      <div className="space-y-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm leading-5">
          <input type="checkbox" name="acceptedTerms" className="mt-1 h-4 w-4 accent-primary" />
          <span data-testid="consent-statement">
            I agree to the{" "}
            {consentDocuments.map((document, index) => (
              <span key={document.code}>
                {index > 0 ? (index === consentDocuments.length - 1 ? " and " : ", ") : null}
                <a href={document.route} target="_blank" rel="noreferrer" className="font-medium underline" data-testid={`consent-link-${document.code}`}>
                  {document.title}
                </a>{" "}
                <span className="text-muted-foreground">(v{document.version}, effective {document.effectiveDate})</span>
              </span>
            ))}
            {consentDocuments.length ? " for this workspace." : "Crecy legal documents — none are available on this deployment."}
          </span>
        </label>
        {draftDocuments.length ? (
          <p className="text-xs text-warning-foreground" data-testid="consent-draft-warning">
            {draftDocuments.map((document) => document.title).join(" and ")}{" "}
            {draftDocuments.length === 1 ? "is" : "are"} still a draft pending legal review. Consent recorded
            here is bound to that draft version and is not a production acceptance.
          </p>
        ) : null}
        <FieldError messages={state.fieldErrors?.acceptedTerms} />
      </div>
      <div className="flex justify-end"><SubmitButton>Create Crecy workspace</SubmitButton></div>
    </form>
  );
}
