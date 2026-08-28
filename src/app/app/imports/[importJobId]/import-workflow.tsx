"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { autoMapImportColumns } from "@/lib/imports/csv";

const portfolioFields = [
  { key: "propertyName", label: "Property name", required: true },
  { key: "propertyType", label: "Property type", required: true },
  { key: "addressLine1", label: "Address line 1", required: true },
  { key: "addressLine2", label: "Address line 2", required: false },
  { key: "locality", label: "City / locality", required: false },
  { key: "subdivisionCode", label: "State / province", required: false },
  { key: "postalCode", label: "Postal code", required: false },
  { key: "countryCode", label: "Country code", required: true },
  { key: "timeZone", label: "Time zone", required: true },
  { key: "unitCode", label: "Unit code", required: false },
  { key: "unitType", label: "Unit type", required: false },
  { key: "bedrooms", label: "Bedrooms", required: false },
  { key: "bathrooms", label: "Bathrooms", required: false },
  { key: "squareFeet", label: "Square feet", required: false },
] as const;

// Occupied-lease import: identify an already-imported unit, then the primary resident + lease terms +
// an optional opening receivable. The command activates the tenancy and posts the opening balance.
const occupiedFields = [
  { key: "propertyName", label: "Property name", required: true },
  { key: "addressLine1", label: "Address line 1", required: true },
  { key: "locality", label: "City / locality", required: false },
  { key: "countryCode", label: "Country code", required: true },
  { key: "unitCode", label: "Unit code", required: true },
  { key: "householdName", label: "Household name", required: false },
  { key: "primaryFirstName", label: "Primary resident first name", required: true },
  { key: "primaryLastName", label: "Primary resident last name", required: true },
  { key: "primaryEmail", label: "Primary resident email", required: false },
  { key: "primaryPhone", label: "Primary resident phone (E.164)", required: false },
  { key: "leaseStartDate", label: "Lease start date", required: true },
  { key: "leaseEndDate", label: "Lease end date", required: false },
  { key: "rentAmountMinor", label: "Rent (minor units)", required: true },
  { key: "rentFrequency", label: "Rent frequency", required: true },
  { key: "currencyCode", label: "Currency code", required: true },
  { key: "externalReference", label: "External reference", required: false },
  { key: "openingBalanceMinor", label: "Opening balance (minor units)", required: false },
  { key: "firstChargeDueDate", label: "First charge due date", required: false },
] as const;

// Combined import: one row is a property + unit + occupied lease, so it needs the portfolio identity
// fields AND the resident/lease fields together.
const combinedFields = [
  { key: "propertyName", label: "Property name", required: true },
  { key: "propertyType", label: "Property type", required: true },
  { key: "addressLine1", label: "Address line 1", required: true },
  { key: "addressLine2", label: "Address line 2", required: false },
  { key: "locality", label: "City / locality", required: false },
  { key: "subdivisionCode", label: "State / province", required: false },
  { key: "postalCode", label: "Postal code", required: false },
  { key: "countryCode", label: "Country code", required: true },
  { key: "timeZone", label: "Time zone", required: true },
  { key: "unitCode", label: "Unit code", required: true },
  { key: "unitType", label: "Unit type", required: false },
  { key: "bedrooms", label: "Bedrooms", required: false },
  { key: "bathrooms", label: "Bathrooms", required: false },
  { key: "squareFeet", label: "Square feet", required: false },
  { key: "householdName", label: "Household name", required: false },
  { key: "primaryFirstName", label: "Primary resident first name", required: true },
  { key: "primaryLastName", label: "Primary resident last name", required: true },
  { key: "primaryEmail", label: "Primary resident email", required: false },
  { key: "primaryPhone", label: "Primary resident phone (E.164)", required: false },
  { key: "leaseStartDate", label: "Lease start date", required: true },
  { key: "leaseEndDate", label: "Lease end date", required: false },
  { key: "rentAmountMinor", label: "Rent (minor units)", required: true },
  { key: "rentFrequency", label: "Rent frequency", required: true },
  { key: "currencyCode", label: "Currency code", required: true },
  { key: "externalReference", label: "External reference", required: false },
  { key: "openingBalanceMinor", label: "Opening balance (minor units)", required: false },
  { key: "firstChargeDueDate", label: "First charge due date", required: false },
] as const;

// Residents import: locate an existing tenancy by property + unit, then describe the co-resident.
const residentFields = [
  { key: "propertyName", label: "Property name", required: true },
  { key: "addressLine1", label: "Address line 1", required: true },
  { key: "locality", label: "City / locality", required: false },
  { key: "countryCode", label: "Country code", required: true },
  { key: "unitCode", label: "Unit code", required: true },
  { key: "firstName", label: "Resident first name", required: true },
  { key: "lastName", label: "Resident last name", required: true },
  { key: "email", label: "Resident email", required: false },
  { key: "phone", label: "Resident phone (E.164)", required: false },
  { key: "financiallyResponsible", label: "Financially responsible (true/false)", required: false },
  { key: "startsOn", label: "Member since", required: false },
] as const;

// Opening-balance import: locate an existing tenancy, then post one balanced receivable.
const openingBalanceFields = [
  { key: "propertyName", label: "Property name", required: true },
  { key: "addressLine1", label: "Address line 1", required: true },
  { key: "locality", label: "City / locality", required: false },
  { key: "countryCode", label: "Country code", required: true },
  { key: "unitCode", label: "Unit code", required: true },
  { key: "openingBalanceMinor", label: "Opening balance (minor units)", required: true },
  { key: "effectiveDate", label: "Effective date", required: false },
  { key: "memo", label: "Memo", required: false },
] as const;

/**
 * Mapping controls for the job's OWN leg.
 *
 * Every leg's validate command rejects a mapping that omits its required keys, so rendering the wrong
 * field set does not merely look odd — it makes the leg unusable, because the operator has no control
 * for the columns the command demands.
 */
const FIELDS_BY_IMPORT_TYPE: Record<string, readonly { key: string; label: string; required: boolean }[]> = {
  portfolio: portfolioFields,
  leases: occupiedFields,
  combined: combinedFields,
  residents: residentFields,
  opening_balances: openingBalanceFields,
};

export function ImportWorkflow({ jobId, importType, headers, currentMapping, currentOptions, status, validationHash, disabled }: {
  jobId: string; importType: string; headers: string[]; currentMapping: Record<string, string>;
  currentOptions?: { dedupeMode: "strict" | "review"; dateLocale: string };
  status: string; validationHash: string | null; disabled: boolean;
}) {
  const fields: readonly { key: string; label: string; required: boolean }[] =
    (Object.hasOwn(FIELDS_BY_IMPORT_TYPE, importType) ? FIELDS_BY_IMPORT_TYPE[importType] : undefined) ?? portfolioFields;
  const router = useRouter();
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.keys(currentMapping).length ? currentMapping : autoMapImportColumns(headers));
  const [dedupeMode, setDedupeMode] = useState<"strict" | "review">(currentOptions?.dedupeMode ?? "strict");
  const [pending, setPending] = useState<"validate" | "commit" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const locked = disabled || status === "completed" || pending !== null;

  async function validate() {
    setPending("validate"); setMessage(null);
    try {
      const response = await fetch(`/api/v1/imports/${jobId}/validate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapping, options: { dedupeMode, dateLocale: currentOptions?.dateLocale ?? "en-US" } }),
      });
      const body = await response.json() as { status?: string; totals?: { errors: number }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Validation could not complete.");
      setMessage({ tone: body.status === "ready" ? "success" : "error", text: body.status === "ready" ? "Every row is valid. Review the totals before committing." : `${body.totals?.errors ?? 0} rows need correction or a different mapping.` });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "Validation could not complete." });
    } finally {
      setPending(null);
    }
  }

  async function commit() {
    if (!validationHash) return;
    setPending("commit"); setMessage(null);
    try {
      const response = await fetch(`/api/v1/imports/${jobId}/commit`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedValidationHash: validationHash }),
      });
      const body = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The import could not be committed.");
      setMessage({ tone: "success", text: "The entire batch committed successfully." });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "The import could not be committed." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <div key={field.key} className="space-y-2"><Label htmlFor={`mapping-${field.key}`}>{field.label}{field.required ? " *" : ""}</Label><NativeSelect id={`mapping-${field.key}`} value={mapping[field.key] ?? ""} disabled={locked} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Not mapped</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</NativeSelect></div>)}</div>
      <div className="space-y-2"><Label htmlFor="dedupe-mode">Duplicate handling</Label><NativeSelect id="dedupe-mode" value={dedupeMode} disabled={locked} onChange={(event) => setDedupeMode(event.target.value as "strict" | "review")}><option value="strict">Strict — block duplicate units</option><option value="review">Review — flag duplicates for review</option></NativeSelect></div>
      {validationHash ? <div className="rounded-lg border bg-muted/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validation hash</p><p className="mt-1 break-all font-mono text-xs">{validationHash}</p></div> : null}
      {message ? <Alert variant={message.tone === "error" ? "destructive" : "info"}>{message.tone === "success" ? <CheckCircle2 className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}<AlertTitle>{message.tone === "success" ? "Workflow updated" : "Action required"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" className="flex-1" disabled={locked} onClick={validate}>{pending === "validate" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{pending === "validate" ? "Validating…" : status === "ready" || status === "failed" ? "Validate again" : "Validate rows"}</Button><Button type="button" className="flex-1" disabled={disabled || pending !== null || status !== "ready" || !validationHash} onClick={commit}>{pending === "commit" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{pending === "commit" ? "Committing…" : "Commit atomically"}</Button></div>
    </div>
  );
}
