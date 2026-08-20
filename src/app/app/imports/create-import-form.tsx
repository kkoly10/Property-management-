"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ImportSourceDocument } from "@/lib/data/imports";

export function CreateImportForm({ organizationId, sources, disabled }: { organizationId: string | null; sources: ImportSourceDocument[]; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [importType, setImportType] = useState<"portfolio" | "leases">("portfolio");
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
      <div className="space-y-2"><Label htmlFor="import-type">Import type</Label><NativeSelect id="import-type" value={importType} disabled={disabled || pending} onChange={(event) => setImportType(event.target.value as "portfolio" | "leases")}><option value="portfolio">Properties and units</option><option value="leases">Occupied leases (residents + opening balances)</option></NativeSelect><p className="text-xs leading-5 text-muted-foreground">{importType === "leases" ? "Activates a lease per row on an already-imported unit: household, tenancy, rent schedule, and a balanced opening receivable." : "Creates empty properties and units. Import occupied leases afterward."}</p></div>
      <div className="space-y-2"><Label htmlFor="source-document">Scanned CSV source</Label><NativeSelect id="source-document" name="sourceDocumentId" required defaultValue="" disabled={disabled || pending}><option value="" disabled>Select a CSV document</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.title} — {source.filename}</option>)}</NativeSelect><p className="text-xs leading-5 text-muted-foreground">Only organization-wide CSV files that passed malware scanning are available.</p></div>
      {error ? <Alert variant="destructive"><Upload className="h-5 w-5" /><AlertTitle>Import not created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button type="submit" disabled={disabled || pending || !sources.length} className="w-full">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{pending ? "Reading CSV…" : "Start import"}</Button>
    </form>
  );
}
