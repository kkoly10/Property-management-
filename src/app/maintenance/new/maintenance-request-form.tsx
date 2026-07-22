"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { MaintenanceTenancy } from "@/lib/data/maintenance";

type SubmissionState = "idle" | "compressing" | "uploading" | "submitting" | "complete" | "error";
const draftKey = "crecy:maintenance-request-draft:v1";

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function compressEvidence(file: File) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the photo.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("This photo could not be compressed.");
  const basename = file.name.replace(/\.[^.]+$/, "") || "maintenance-photo";
  return new File([blob], `${basename}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

async function uploadEvidence(file: File, tenancy: MaintenanceTenancy, title: string) {
  const checksum = await sha256Hex(file);
  const grantResponse = await fetch("/api/v1/documents/upload-grants", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({
      organizationId: tenancy.organizationId, parent: { type: "tenancy", id: tenancy.tenancyId },
      documentType: "maintenance_evidence", title: `Maintenance evidence — ${title}`,
      originalFilename: file.name, mimeType: file.type, sizeBytes: file.size,
    }),
  });
  const grant = await grantResponse.json() as { uploadUrl?: string; grantId?: string; storagePath?: string; error?: string };
  if (!grantResponse.ok || !grant.uploadUrl || !grant.grantId || !grant.storagePath) throw new Error(grant.error ?? "A photo upload could not be prepared.");
  const token = new URL(grant.uploadUrl).searchParams.get("token");
  if (!token) throw new Error("A private upload token is missing.");
  const uploaded = await createClient().storage.from("private-documents").uploadToSignedUrl(grant.storagePath, token, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const finalizeResponse = await fetch("/api/v1/documents/finalize", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ grantId: grant.grantId, sha256Hex: checksum }),
  });
  const finalized = await finalizeResponse.json() as { documentId?: string; error?: string };
  if (!finalizeResponse.ok || !finalized.documentId) throw new Error(finalized.error ?? "A photo could not be verified.");
  return finalized.documentId;
}

export function MaintenanceRequestForm({ tenancies, disabled }: { tenancies: MaintenanceTenancy[]; disabled: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const busy = !["idle", "error", "complete"].includes(state);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Record<string, string> | null;
      if (!draft) return;
      for (const [name, value] of Object.entries(draft)) {
        const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (field) field.value = value;
      }
    } catch { localStorage.removeItem(draftKey); }
  }, []);

  function saveDraft() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    const fields = ["tenancyId", "category", "title", "description", "priorityRequested", "accessPermission", "preferredStart", "preferredEnd"];
    localStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(fields.map((field) => [field, String(form.get(field) ?? "")]))));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const tenancy = tenancies.find((item) => item.tenancyId === form.get("tenancyId"));
    const title = String(form.get("title") ?? "").trim();
    const files = form.getAll("evidence").filter((value): value is File => value instanceof File && value.size > 0);
    if (!tenancy) { setState("error"); setMessage("Choose the home that needs service."); return; }
    if (files.length > 5) { setState("error"); setMessage("Attach no more than five photos."); return; }
    if (files.some((file) => !["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setState("error"); setMessage("Photos must be PNG or JPEG files no larger than 10 MB each."); return;
    }

    try {
      setState("compressing");
      const prepared = await Promise.all(files.map(compressEvidence));
      setState("uploading");
      const evidenceDocumentIds = await Promise.all(prepared.map((file) => uploadEvidence(file, tenancy, title)));
      const start = String(form.get("preferredStart") ?? "");
      const end = String(form.get("preferredEnd") ?? "");
      const preferredTimes = start && end ? [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }] : [];
      setState("submitting");
      const response = await fetch("/api/v1/maintenance-requests", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          tenancyId: tenancy.tenancyId, category: String(form.get("category")), title,
          description: String(form.get("description")), priorityRequested: String(form.get("priorityRequested")) || undefined,
          accessPermission: String(form.get("accessPermission")) || undefined, preferredTimes, evidenceDocumentIds,
        }),
      });
      const result = await response.json() as { maintenanceRequestId?: string; publicReference?: string; error?: string };
      if (!response.ok || !result.maintenanceRequestId) throw new Error(result.error ?? "The request could not be submitted.");
      localStorage.removeItem(draftKey);
      setState("complete");
      setMessage(`${result.publicReference} was sent to your property team.`);
      router.push(`/maintenance/${result.maintenanceRequestId}`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The request could not be submitted. Your text draft is still saved.");
    }
  }

  const submitLabel = state === "compressing" ? "Compressing photos…" : state === "uploading" ? "Uploading privately…" : state === "submitting" ? "Sending request…" : "Submit request";
  return <form ref={formRef} onSubmit={handleSubmit} onChange={saveDraft} className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="maintenance-home">Home</Label><NativeSelect id="maintenance-home" name="tenancyId" required disabled={disabled || busy}>{tenancies.map((item) => <option key={item.tenancyId} value={item.tenancyId}>{item.propertyName} · Unit {item.unitCode}</option>)}</NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="maintenance-category">Category</Label><NativeSelect id="maintenance-category" name="category" required disabled={disabled || busy}><option value="plumbing">Plumbing</option><option value="electrical">Electrical</option><option value="heating_cooling">Heating or cooling</option><option value="appliance">Appliance</option><option value="pest">Pest</option><option value="safety">Safety concern</option><option value="other">Other</option></NativeSelect></div>
    </div>
    <div className="space-y-2"><Label htmlFor="maintenance-title">What needs attention?</Label><Input id="maintenance-title" name="title" required minLength={3} maxLength={160} placeholder="Kitchen sink is leaking" disabled={disabled || busy} /></div>
    <div className="space-y-2"><Label htmlFor="maintenance-description">Describe the issue</Label><Textarea id="maintenance-description" name="description" required minLength={10} maxLength={4000} placeholder="Tell us when it started, where it is, and what you have already tried." disabled={disabled || busy} /></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="maintenance-priority">How urgent does it feel?</Label><NativeSelect id="maintenance-priority" name="priorityRequested" defaultValue="medium" disabled={disabled || busy}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></NativeSelect><p className="text-xs leading-5 text-muted-foreground">This is your requested priority. The property team sets the official priority after review.</p></div>
      <div className="space-y-2"><Label htmlFor="maintenance-evidence">Photos (optional)</Label><Input id="maintenance-evidence" name="evidence" type="file" accept="image/png,image/jpeg" multiple disabled={disabled || busy} onChange={(event) => setFileCount(event.target.files?.length ?? 0)} className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold" /><p className="text-xs leading-5 text-muted-foreground">{fileCount ? `${fileCount} selected · ` : ""}Up to 5 PNG or JPEG photos. Images are compressed before upload.</p></div>
    </div>
    <div className="space-y-2"><Label htmlFor="maintenance-access">Access instructions (optional)</Label><Textarea id="maintenance-access" name="accessPermission" maxLength={500} placeholder="Call before entering; the dog will be secured." disabled={disabled || busy} className="min-h-20" /></div>
    <fieldset className="space-y-3 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Preferred visit window (optional)</legend><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="preferred-start">From</Label><Input id="preferred-start" name="preferredStart" type="datetime-local" disabled={disabled || busy} /></div><div className="space-y-2"><Label htmlFor="preferred-end">Until</Label><Input id="preferred-end" name="preferredEnd" type="datetime-local" disabled={disabled || busy} /></div></div></fieldset>
    <Alert variant="warning"><ShieldCheck className="h-5 w-5" /><AlertTitle>For emergencies, call local emergency services</AlertTitle><AlertDescription>Do not use this form for fire, gas odor, active flooding, or an immediate threat to life or safety. Then contact your property’s emergency line.</AlertDescription></Alert>
    {message ? <Alert variant={state === "error" ? "destructive" : "info"}>{state === "complete" ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}<AlertTitle>{state === "error" ? "Request not sent" : "Request submitted"}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
    <Button type="submit" size="lg" className="w-full" disabled={disabled || busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{submitLabel}</Button>
  </form>;
}
