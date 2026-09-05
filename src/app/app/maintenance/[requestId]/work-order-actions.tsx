"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, CircleX, LoaderCircle, PlayCircle, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Transition = "accept" | "schedule" | "start" | "complete" | "close" | "cancel";
type Result = { workOrderId: string; status: string; version: number };

/** The scan states an evidence document can be in, collapsed to the three the operator needs to act on. */
type EvidencePhase = "scanning" | "clean" | "rejected";
type Evidence = { documentId: string; filename: string; phase: EvidencePhase };

const nextTransition: Record<string, Transition | null> = {
  assigned: "accept", accepted: "schedule", scheduled: "start", in_progress: "complete", completed: "close",
};
const actionLabel: Record<Transition, string> = { accept: "Mark vendor accepted", schedule: "Schedule visit", start: "Mark started", complete: "Mark complete", close: "Close work order", cancel: "Cancel work order" };
const toMinor = (value: string) => { if (!value.trim()) return null; const number = Number(value); return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };

/** quarantined/scanning → still scanning; clean → clean; rejected/deleted/anything else → cannot be used. */
function phaseOf(uploadStatus: string): EvidencePhase {
  if (uploadStatus === "clean") return "clean";
  if (uploadStatus === "quarantined" || uploadStatus === "scanning") return "scanning";
  return "rejected";
}

async function checksumHex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Upload one evidence file and return its finalized document id. The file lands quarantined. */
async function uploadWorkOrderEvidence(file: File, workOrderId: string, organizationId: string): Promise<string> {
  const grantResponse = await fetch("/api/v1/documents/upload-grants", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId, parent: { type: "work_order", id: workOrderId }, documentType: "work_order_evidence", title: `Completion evidence — ${file.name}`, originalFilename: file.name, mimeType: file.type, sizeBytes: file.size }),
  });
  const grant = await grantResponse.json() as { uploadUrl?: string; grantId?: string; storagePath?: string; error?: string };
  if (!grantResponse.ok || !grant.uploadUrl || !grant.grantId || !grant.storagePath) throw new Error(grant.error ?? "Evidence could not be prepared for upload.");
  const token = new URL(grant.uploadUrl).searchParams.get("token");
  if (!token) throw new Error("A private upload token is missing.");
  const uploaded = await createClient().storage.from("private-documents").uploadToSignedUrl(grant.storagePath, token, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const finalizeResponse = await fetch("/api/v1/documents/finalize", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantId: grant.grantId, sha256Hex: await checksumHex(file) }),
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
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const idempotencyKey = useRef<string | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  function changed() { idempotencyKey.current = null; setError(null); }

  const scanning = evidence.filter((item) => item.phase === "scanning");
  const rejected = evidence.filter((item) => item.phase === "rejected");
  const clean = evidence.filter((item) => item.phase === "clean");

  // Upload each chosen file as its own asynchronous item. Completion is NOT attempted here — the bytes
  // are quarantined until the scanner clears them, and the completion command refuses anything unclean.
  async function addEvidence() {
    const files = Array.from(evidenceInputRef.current?.files ?? []);
    if (files.length === 0) return;
    setUploading(true); setError(null);
    try {
      const added: Evidence[] = [];
      for (const file of files) {
        const documentId = await uploadWorkOrderEvidence(file, workOrderId, organizationId);
        added.push({ documentId, filename: file.name, phase: "scanning" });
      }
      setEvidence((current) => [...current, ...added]);
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  // Poll the scan states of everything uploaded. Manual on purpose: scans run on a periodic worker, so a
  // second-by-second poll would spin without resolving faster — the operator refreshes when ready.
  async function refreshScanStatus() {
    if (evidence.length === 0) return;
    setRefreshing(true); setError(null);
    try {
      const ids = evidence.map((item) => item.documentId).join(",");
      const response = await fetch(`/api/v1/documents/scan-status?ids=${encodeURIComponent(ids)}`);
      const body = await response.json() as { versions?: { documentId: string; uploadStatus: string }[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Scan status is unavailable.");
      const byId = new Map((body.versions ?? []).map((version) => [version.documentId, version.uploadStatus]));
      setEvidence((current) => current.map((item) => {
        const status = byId.get(item.documentId);
        return status ? { ...item, phase: phaseOf(status) } : item;
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan status is unavailable.");
    } finally {
      setRefreshing(false);
    }
  }

  function removeEvidence(documentId: string) {
    setEvidence((current) => current.filter((item) => item.documentId !== documentId));
    changed();
  }

  async function run(transition: Transition, extra: Record<string, unknown> = {}) {
    setPending(transition); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      // Only clean evidence is ever sent. The button is already gated on this, but the completion
      // command is the authority and would reject anything else regardless.
      const evidenceDocumentIds = transition === "complete" ? clean.map((item) => item.documentId) : undefined;
      const response = await fetch(`/api/v1/work-orders/${workOrderId}/transitions`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ expectedVersion: version, transition, evidenceDocumentIds, ...extra }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "That update could not be completed."); }
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

  const busy = disabled || pending !== null || uploading;
  // A completion may proceed once notes exist and nothing attached is still unusable: no file mid-scan,
  // none rejected. Whether evidence is REQUIRED is the completion command's call — if none is attached
  // and the organization requires it, the command answers COMPLETION_EVIDENCE_REQUIRED, surfaced below.
  const completionBlocked = scanning.length > 0 || rejected.length > 0;

  return <WorkspacePanel
    title="Advance work order"
    description={<>Current status: <span className="font-medium text-foreground">{status.replaceAll("_", " ")}</span></>}
    bodyClassName="space-y-4 p-5 sm:p-6"
  >
    {error ? <Alert variant="destructive"><AlertTitle>Not updated</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {primary === "schedule" ? <div className="grid gap-3 rounded-lg border p-4"><div className="space-y-2"><Label htmlFor="wo-start">Visit start</Label><Input id="wo-start" type="datetime-local" value={scheduledStart} disabled={busy} onChange={(event) => { setScheduledStart(event.target.value); changed(); }} /></div><div className="space-y-2"><Label htmlFor="wo-end">Visit end</Label><Input id="wo-end" type="datetime-local" value={scheduledEnd} disabled={busy} onChange={(event) => { setScheduledEnd(event.target.value); changed(); }} /></div></div> : null}
    {primary === "complete" ? <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-2"><Label htmlFor="wo-summary">Completion notes</Label><Textarea id="wo-summary" required minLength={3} maxLength={4000} placeholder="Replaced the trap and tightened the supply line." value={completionSummary} disabled={busy} onChange={(event) => { setCompletionSummary(event.target.value); changed(); }} /></div>
      <div className="space-y-2"><Label htmlFor="wo-actual-cost">Actual cost (optional)</Label><Input id="wo-actual-cost" inputMode="decimal" placeholder="0.00" value={actualCost} disabled={busy} onChange={(event) => { setActualCost(event.target.value); changed(); }} /></div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="wo-evidence">Completion evidence</Label>
          <Input id="wo-evidence" ref={evidenceInputRef} type="file" accept="image/png,image/jpeg" multiple disabled={busy} className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold" />
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" />Photos are scanned before a work order can be completed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={addEvidence}>{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{uploading ? "Uploading…" : "Upload evidence"}</Button>
          {evidence.length > 0 ? <Button type="button" variant="ghost" size="sm" disabled={busy || refreshing} onClick={refreshScanStatus}>{refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh scan status</Button> : null}
        </div>

        {evidence.length > 0 ? <ul className="space-y-2" aria-label="Uploaded evidence">
          {evidence.map((item) => <li key={item.documentId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{item.filename}</span>
            {item.phase === "scanning" ? <Badge variant="warning"><LoaderCircle className="mr-1 h-3 w-3 animate-spin" />Scanning</Badge> : null}
            {item.phase === "clean" ? <Badge variant="success"><ShieldCheck className="mr-1 h-3 w-3" />Ready</Badge> : null}
            {item.phase === "rejected" ? <Badge variant="destructive"><ShieldAlert className="mr-1 h-3 w-3" />Rejected</Badge> : null}
            <button type="button" aria-label={`Remove ${item.filename}`} className="text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => removeEvidence(item.documentId)}><Trash2 className="h-4 w-4" /></button>
          </li>)}
        </ul> : null}

        {scanning.length > 0 ? <Alert variant="warning"><AlertTitle>Evidence is still being scanned</AlertTitle><AlertDescription>Completion unlocks once every file is scanned clean. Refresh scan status to check.</AlertDescription></Alert> : null}
        {rejected.length > 0 ? <Alert variant="destructive"><ShieldAlert className="h-5 w-5" /><AlertTitle>Rejected evidence must be replaced</AlertTitle><AlertDescription>Remove the rejected {rejected.length === 1 ? "file" : "files"} and upload a replacement before completing.</AlertDescription></Alert> : null}
      </div>
    </div> : null}
    {primary ? <Button className="w-full" size="lg" disabled={busy || (primary === "schedule" && (!scheduledStart || !scheduledEnd)) || (primary === "complete" && (!completionSummary.trim() || completionBlocked))} onClick={() => run(primary, primary === "schedule" ? { scheduledStart: new Date(scheduledStart).toISOString(), scheduledEnd: new Date(scheduledEnd).toISOString() } : primary === "complete" ? { completionSummary, actualCostMinor: toMinor(actualCost) ?? undefined } : {})}>{pending === primary ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}{actionLabel[primary]}</Button> : null}
    {canCancel ? showCancel ? <div className="space-y-3 rounded-lg border border-destructive/40 p-4"><div className="space-y-2"><Label htmlFor="wo-cancel-reason">Cancellation reason</Label><Input id="wo-cancel-reason" required minLength={3} maxLength={1000} value={cancelReason} disabled={busy} onChange={(event) => { setCancelReason(event.target.value); changed(); }} /></div><Button variant="destructive" className="w-full" disabled={busy || !cancelReason.trim()} onClick={() => run("cancel", { reason: cancelReason })}>{pending === "cancel" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}Confirm cancellation</Button></div> : <Button variant="ghost" className="w-full text-destructive" disabled={disabled} onClick={() => setShowCancel(true)}><RotateCcw className="h-4 w-4" />Cancel this work order</Button> : null}
  </WorkspacePanel>;
}
