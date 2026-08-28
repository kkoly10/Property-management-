"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ImportSourceDocument } from "@/lib/data/imports";
import { importTypes, type ImportType } from "@/lib/validation/imports";


/** One label and one plain-language consequence per leg, so the operator picks by outcome. */
export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  portfolio: "Properties and units",
  combined: "Everything in one file (properties, units, and occupied leases)",
  leases: "Occupied leases onto imported units",
  residents: "Additional residents for existing households",
  opening_balances: "Opening balances for existing tenancies",
};

export const IMPORT_TYPE_HINTS: Record<ImportType, string> = {
  portfolio: "Creates empty properties and units. Import occupied leases afterward.",
  combined: "One row per occupied unit: creates the property and unit if they are new, then activates the lease with its household, tenancy, rent schedule, and balanced opening receivable.",
  leases: "Activates a lease per row on an already-imported unit: household, tenancy, rent schedule, and a balanced opening receivable.",
  residents: "Adds co-residents to the household of a tenancy that already exists. Someone already on the household is reported, not duplicated.",
  opening_balances: "Posts a balanced opening receivable for a tenancy imported without one. A tenancy that already has an opening balance is refused.",
};

export function CreateImportForm({ organizationId, sources, disabled }: { organizationId: string | null; sources: ImportSourceDocument[]; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [importType, setImportType] = useState<ImportType>("portfolio");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/imports", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ organizationId, importType, sourceDocumentId: String(form.get("sourceDocumentId")) }),
      });
      const body = await response.json() as { importJobId?: string; error?: string };
      if (!response.ok || !body.importJobId) throw new Error(body.error ?? "The import could not be created.");
      router.push(`/app/imports/${body.importJobId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import could not be created.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="import-type">Import type</Label>
        <NativeSelect id="import-type" value={importType} disabled={disabled || pending} onChange={(event) => setImportType(event.target.value as ImportType)}>
          {importTypes.map((type) => <option key={type} value={type}>{IMPORT_TYPE_LABELS[type]}</option>)}
        </NativeSelect>
        <p className="text-xs leading-5 text-muted-foreground">{IMPORT_TYPE_HINTS[importType]}</p>
      </div>
      <div className="space-y-2"><Label htmlFor="source-document">Scanned spreadsheet source</Label><NativeSelect id="source-document" name="sourceDocumentId" required defaultValue="" disabled={disabled || pending}><option value="" disabled>Select a spreadsheet</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.title} — {source.filename}</option>)}</NativeSelect><p className="text-xs leading-5 text-muted-foreground">Only organization-wide CSV or Excel files that passed malware scanning are available.</p></div>
      {error ? <Alert variant="destructive"><Upload className="h-5 w-5" /><AlertTitle>Import not created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button type="submit" disabled={disabled || pending || !sources.length} className="w-full">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{pending ? "Reading spreadsheet…" : "Start import"}</Button>
    </form>
  );
}
