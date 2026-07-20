"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, UploadCloud } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/client";
import { documentMimeTypes, maximumDocumentSizeBytes } from "@/lib/validation/documents";

type UploadState = "idle" | "hashing" | "uploading" | "finalizing" | "complete" | "error";

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function DocumentUploadForm({ organizationId, properties, disabled }: {
  organizationId: string | null;
  properties: Array<{ id: string; name: string }>;
  disabled: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const busy = !["idle", "complete", "error"].includes(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const propertyId = String(form.get("propertyId") ?? "");
    if (!(file instanceof File) || !file.size || !organizationId) return;
    if (!documentMimeTypes.includes(file.type as (typeof documentMimeTypes)[number])) {
      setState("error"); setMessage("Choose a PDF, CSV, Word, PNG, JPEG, or ZIP file."); return;
    }
    if (file.size > maximumDocumentSizeBytes) {
      setState("error"); setMessage("Documents must be 25 MB or smaller."); return;
    }

    try {
      setState("hashing");
      const checksum = await sha256Hex(file);
      const grantResponse = await fetch("/api/v1/documents/upload-grants", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          organizationId,
          parent: propertyId ? { type: "property", id: propertyId } : { type: "organization", id: organizationId },
          documentType: String(form.get("documentType")), title: String(form.get("title")),
          originalFilename: file.name, mimeType: file.type, sizeBytes: file.size,
        }),
      });
      const grant = await grantResponse.json() as { uploadUrl?: string; grantId?: string; storagePath?: string; error?: string };
      if (!grantResponse.ok || !grant.uploadUrl || !grant.grantId || !grant.storagePath) throw new Error(grant.error ?? "The upload could not be prepared.");

      const token = new URL(grant.uploadUrl).searchParams.get("token");
      if (!token) throw new Error("The private upload token is missing.");
      setState("uploading");
      const uploaded = await createClient().storage.from("private-documents").uploadToSignedUrl(grant.storagePath, token, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;

      setState("finalizing");
      const finalizeResponse = await fetch("/api/v1/documents/finalize", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ grantId: grant.grantId, sha256Hex: checksum }),
      });
      const finalized = await finalizeResponse.json() as { error?: string };
      if (!finalizeResponse.ok) throw new Error(finalized.error ?? "The document could not be finalized.");

      formRef.current?.reset();
      setState("complete");
      setMessage("Upload verified. The document is quarantined while malware scanning completes.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The upload failed. Try again.");
    }
  }

  const buttonLabel = state === "hashing" ? "Checking file…" : state === "uploading" ? "Uploading…" : state === "finalizing" ? "Verifying…" : "Upload securely";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="document-title">Title</Label><Input id="document-title" name="title" placeholder="Signed lease — Unit 101" required maxLength={200} disabled={disabled || busy} /></div>
      <div className="space-y-2"><Label htmlFor="document-type">Document type</Label><NativeSelect id="document-type" name="documentType" defaultValue="signed_lease" disabled={disabled || busy}><option value="signed_lease">Signed lease</option><option value="property_record">Property record</option><option value="portfolio_import">Portfolio import source</option><option value="resident_import">Resident import source</option><option value="owner_document">Owner document</option><option value="other">Other</option></NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="document-property">Location</Label><NativeSelect id="document-property" name="propertyId" defaultValue="" disabled={disabled || busy}><option value="">Organization-wide</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="document-file">File</Label><Input id="document-file" name="file" type="file" accept={documentMimeTypes.join(",")} required disabled={disabled || busy} className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold" /><p className="text-xs leading-5 text-muted-foreground">PDF, CSV, Word, PNG, JPEG, or ZIP. Maximum 25 MB.</p></div>
      {message ? <Alert variant={state === "error" ? "destructive" : "info"}>{state === "complete" ? <CheckCircle2 className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}<AlertTitle>{state === "error" ? "Upload stopped" : "Upload received"}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
      <Button type="submit" className="w-full" disabled={disabled || busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{buttonLabel}</Button>
    </form>
  );
}
