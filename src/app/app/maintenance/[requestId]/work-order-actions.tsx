"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, CircleX, LoaderCircle, PlayCircle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

type Transition = "accept" | "schedule" | "start" | "complete" | "close" | "cancel";
type Result = { workOrderId: string; status: string; version: number };
const toMinor = (value: string) => { if (!value.trim()) return null; const number = Number(value); return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };

const nextTransition: Record<string, Transition | null> = {
  assigned: "accept", accepted: "schedule", scheduled: "start", in_progress: "complete", completed: "close",
  draft: null, awaiting_approval: null, closed: null, canceled: null,
};
const actionLabel: Record<Transition, string> = { accept: "Mark vendor accepted", schedule: "Schedule visit", start: "Mark started", complete: "Mark complete", close: "Close work order", cancel: "Cancel work order" };

async function uploadWorkOrderEvidence(file: File, workOrderId: string, organizationId: string) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const grantResponse = await fetch("/api/v1/documents/upload-grants", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ organizationId, parent: { type: "work_order", id: workOrderId }, documentType: "work_order_evidence", title: `Completion evidence — ${file.name}`, originalFilename: file.name, mimeType: file.type, sizeBytes: file.size }),
  });
  const grant = await grantResponse.json() as { uploadUrl?: string; grantId?: string; storagePath?: string; error?: string };
  if (!grantResponse.ok || !grant.uploadUrl || !grant.grantId || !grant.storagePath) throw new Error(grant.error ?? "Evidence could not be prepared for upload.");
  const token = new URL(grant.uploadUrl).searchParams.get("token");
  if (!token) throw new Error("A private upload token is missing.");
  const uploaded = await createClient().storage.from("private-documents").uploadToSignedUrl(grant.storagePath, token, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const finalizeResponse = await fetch("/api/v1/documents/finalize", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ grantId: grant.grantId, sha256Hex: checksum }),
  });
  const finalized = await finalizeResponse.json() as { documentId?: string; error?: string };
  if (!finalizeResponse.ok || !finalized.documentId) throw new Error(finalized.error ?? "Evidence could not be verified.");
  return finalized.documentId;
}

export function WorkOrderActions({ workOrderId, organizationId, status, version, disabled }: { workOrderId: string; organizationId: string; status: string; version: number; disabled: boolean }) {
  const router = useRouter();
  const primary = nextTransition[status] ?? null;
  const canCancel = !["completed", "closed", "canceled"].includes(status);
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [completionSummary, setCompletionSummary] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [pending, setPending] = useState<Transition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function run(transition: Transition, extra: Record<string, unknown> = {}) {
    setPending(transition); setError(null);
    idempotencyKey.current = crypto.randomUUID();
    try {
      let evidenceDocumentIds: string[] | undefined;
      if (transition === "complete") {
        const files = Array.from(document.getElementById("wo-evidence") instanceof HTMLInputElement ? (document.getElementById("wo-evidence") as HTMLInputElement).files ?? [] : []);
        evidenceDocumentIds = await Promise.all(files.map((file) => uploadWorkOrderEvidence(file, workOrderId, organizationId)));
      }
      const response = await fetch(`/api/v1/work-orders/${workOrderId}/transitions`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ expectedVersion: version, transition, evidenceDocumentIds, ...extra }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "That update could not be completed.");
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That update could not be completed.");
    } finally {
      setPending(null);
    }
  }

  if (result) return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Updated to {result.status.replaceAll("_", " ")}</AlertTitle><AlertDescription>Version {result.version}.</AlertDescription></Alert>;
  if (!primary && !canCancel) return null;

  return <Card><CardHeader><CardTitle>Update status</CardTitle><CardDescription>Current status: {status.replaceAll("_", " ")}</CardDescription></CardHeader><CardContent className="space-y-4">
    {error ? <Alert variant="destructive"><AlertTitle>Not updated</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {primary === "schedule" ? <div className="grid gap-3 rounded-lg border p-4"><div className="space-y-2"><Label htmlFor="wo-start">Visit start</Label><Input id="wo-start" type="datetime-local" value={scheduledStart} disabled={disabled || pending !== null} onChange={(event) => setScheduledStart(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="wo-end">Visit end</Label><Input id="wo-end" type="datetime-local" value={scheduledEnd} disabled={disabled || pending !== null} onChange={(event) => setScheduledEnd(event.target.value)} /></div></div> : null}
    {primary === "complete" ? <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-2"><Label htmlFor="wo-summary">Completion notes</Label><Textarea id="wo-summary" required minLength={3} maxLength={4000} placeholder="Replaced the trap and tightened the supply line." value={completionSummary} disabled={disabled || pending !== null} onChange={(event) => setCompletionSummary(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="wo-actual-cost">Actual cost (optional)</Label><Input id="wo-actual-cost" inputMode="decimal" placeholder="0.00" value={actualCost} disabled={disabled || pending !== null} onChange={(event) => setActualCost(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="wo-evidence">Evidence photos</Label><Input id="wo-evidence" type="file" accept="image/png,image/jpeg" multiple disabled={disabled || pending !== null} className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold" /><p className="flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" />Attach photos showing the completed repair.</p></div>
    </div> : null}
    {primary ? <Button className="w-full" size="lg" disabled={disabled || pending !== null || (primary === "schedule" && (!scheduledStart || !scheduledEnd)) || (primary === "complete" && !completionSummary.trim())} onClick={() => run(primary, primary === "schedule" ? { scheduledStart: new Date(scheduledStart).toISOString(), scheduledEnd: new Date(scheduledEnd).toISOString() } : primary === "complete" ? { completionSummary, actualCostMinor: toMinor(actualCost) ?? undefined } : {})}>{pending === primary ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}{actionLabel[primary]}</Button> : null}
    {canCancel ? showCancel ? <div className="space-y-3 rounded-lg border border-destructive/40 p-4"><div className="space-y-2"><Label htmlFor="wo-cancel-reason">Cancellation reason</Label><Input id="wo-cancel-reason" required minLength={3} maxLength={1000} value={cancelReason} disabled={disabled || pending !== null} onChange={(event) => setCancelReason(event.target.value)} /></div><Button variant="destructive" className="w-full" disabled={disabled || pending !== null || !cancelReason.trim()} onClick={() => run("cancel", { reason: cancelReason })}>{pending === "cancel" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}Confirm cancellation</Button></div> : <Button variant="ghost" className="w-full text-destructive" disabled={disabled} onClick={() => setShowCancel(true)}><RotateCcw className="h-4 w-4" />Cancel this work order</Button> : null}
  </CardContent></Card>;
}
