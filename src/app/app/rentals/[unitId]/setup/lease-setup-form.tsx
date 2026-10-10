"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { LeaseSetupComplete } from "@/components/app/lease-setup-complete";
import { createClient } from "@/lib/supabase/client";
import { emptyLeaseDraft, leaseDraftProblem, type HomeownerLeaseDraft, type LeaseUploadReceipt } from "@/lib/validation/homeowner-lease";
import { leaseSetupStateSchema, leaseActivationResultSchema, type LeaseSetupState } from "@/lib/homeowner/lease-state";

const API = "/api/v1/homeowner-lease-setups";
const AGREEMENT_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"];
class RequestFailure extends Error { constructor(message: string, public status: number) { super(message); } }
async function jsonRequest(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await response.json();
  if (!response.ok) throw new RequestFailure(typeof body === "object" && body && "error" in body ? String(body.error) : "The request could not be completed.", response.status);
  return body;
}
export function LeaseSetupForm({ organizationId, unitId, initial, disabled }: {
  organizationId: string; unitId: string; initial: LeaseSetupState; disabled: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<HomeownerLeaseDraft>(initial.draft ?? emptyLeaseDraft());
  const [server, setServer] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [openingConfirmed, setOpeningConfirmed] = useState(false);
  const [agreementConfirmed, setAgreementConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState<"save" | "activation" | null>(null);
  const saveOperation = useRef<{ expectedRevision: number; draft: HomeownerLeaseDraft; key: string } | null>(null);
  const busyRef = useRef(false);
  const revisionRef = useRef(initial.revision);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedUrl = `${API}?${new URLSearchParams({ organizationId, unitId })}`;
  const selected = server.documents.find(doc => doc.versionId === draft.documentVersionId);
  const locked = disabled || busy || uncertain !== null;
  function edit(patch: Partial<HomeownerLeaseDraft>) {
    setDraft(current => ({ ...current, ...patch })); setDirty(true); setReviewing(false);
    setOpeningConfirmed(false); setAgreementConfirmed(false); setError(null); setMessage(null);
  }
  async function loadSaved() {
    if (disabled || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const next = leaseSetupStateSchema.parse(await jsonRequest(savedUrl));
      revisionRef.current = next.revision;
      setServer(next); setDraft(next.draft ?? emptyLeaseDraft()); setDirty(false); setUncertain(null);
      saveOperation.current = null; setReviewing(false); setOpeningConfirmed(false); setAgreementConfirmed(false);
      setMessage("Loaded the saved setup. Unsaved local edits were replaced.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The saved setup is unavailable."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  // Calls are serialized by the outer operation. Keep the exact uncertain payload/key for retries.
  async function persist(next: HomeownerLeaseDraft): Promise<boolean> {
    saveOperation.current ??= { expectedRevision: revisionRef.current, draft: next, key: crypto.randomUUID() };
    const operation = saveOperation.current;
    try {
      const saved = leaseSetupStateSchema.parse(await jsonRequest(API, { method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": operation.key },
        body: JSON.stringify({ organizationId, unitId, expectedRevision: operation.expectedRevision, draft: operation.draft }),
      }));
      revisionRef.current = saved.revision;
      setServer(saved); setDraft(saved.draft ?? operation.draft); setDirty(false); setUncertain(null);
      saveOperation.current = null; setMessage("Draft saved. You can continue from another device.");
      return true;
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) { saveOperation.current = null; setUncertain(null); } else setUncertain("save");
      setError(caught instanceof Error ? caught.message : "Save could not be confirmed. Retry the same save or load the server version.");
      return false;
    }
  }
  async function save(review = false) {
    if (disabled || busyRef.current || uncertain === "activation") return;
    if (review) {
      const problem = leaseDraftProblem(draft, server.localDate);
      if (problem || selected?.status !== "clean") { setError(problem ?? "Wait until the selected agreement has passed scanning."); return; }
    }
    busyRef.current = true; setBusy(true); setError(null);
    const okay = await persist(draft);
    if (okay && review) { setReviewing(true); setOpeningConfirmed(false); setAgreementConfirmed(false); }
    busyRef.current = false; setBusy(false);
  }
  async function activate() {
    if (disabled || busyRef.current || dirty || !reviewing || !openingConfirmed || !agreementConfirmed) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = leaseActivationResultSchema.parse(await jsonRequest(`${API}/activate`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, unitId, expectedRevision: server.revision, openingConfirmed, agreementConfirmed }),
      }));
      setServer(current => ({ ...current, result, status: "activated" })); setUncertain(null); router.refresh();
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      setUncertain(definite ? null : "activation");
      if (definite) { setReviewing(false); setOpeningConfirmed(false); setAgreementConfirmed(false); }
      setError(caught instanceof Error ? caught.message : "Activation could not be confirmed. Retry this same activation or load its saved result.");
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function finishReceipt(receipt: LeaseUploadReceipt, base: HomeownerLeaseDraft) {
    const finalized = z.object({ documentId: z.uuid(), versionId: z.uuid() }).parse(await jsonRequest("/api/v1/documents/finalize", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": receipt.finalizeKey },
      body: JSON.stringify({ grantId: receipt.grantId, sha256Hex: receipt.checksum }),
    }));
    if (await persist({ ...base, documentVersionId: finalized.versionId, upload: null })) {
      setMessage("Agreement received. It must finish malware scanning before activation.");
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function uploadAgreement() {
    const file = fileRef.current?.files?.[0];
    if (disabled || busyRef.current || uncertain || !file) return;
    if (!AGREEMENT_TYPES.includes(file.type) || file.size === 0 || file.size > 25 * 1024 * 1024) {
      setError("Choose a PDF, Word, PNG or JPEG agreement up to 25 MB."); return;
    }
    busyRef.current = true; setBusy(true); setError(null); setReviewing(false);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const grant = z.object({ grantId: z.uuid(), uploadUrl: z.url(), storagePath: z.string().min(1) }).parse(await jsonRequest("/api/v1/documents/upload-grants", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ organizationId, parent: { type: "unit", id: unitId }, documentType: "signed_lease",
          title: `Signed agreement — ${file.name}`.slice(0, 200), originalFilename: file.name, mimeType: file.type, sizeBytes: file.size }),
      }));
      const receipt = { grantId: grant.grantId, checksum, filename: file.name, finalizeKey: crypto.randomUUID() };
      const next = { ...draft, upload: receipt };
      // Persist only receipt metadata before transferring bytes. Never persist a signed URL/token.
      if (!await persist(next)) return;
      const token = new URL(grant.uploadUrl).searchParams.get("token");
      if (!token) throw new Error("The private upload could not be prepared.");
      const uploaded = await createClient().storage.from("private-documents").uploadToSignedUrl(grant.storagePath, token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      await finishReceipt(receipt, next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload could not be confirmed. Finish verification, or choose the file again if it was not transferred.");
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function resumeUpload() {
    if (disabled || busyRef.current || uncertain || !draft.upload) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await finishReceipt(draft.upload, draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Verification is unavailable. Choose the file again if it was not transferred."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function checkScan() {
    if (disabled) return;
    try {
      const next = leaseSetupStateSchema.parse(await jsonRequest(savedUrl));
      setServer(current => ({ ...current, documents: next.documents, localDate: next.localDate,
        ...(next.result ? { result: next.result, status: next.status } : {}) }));
    } catch { setMessage("Scan status is temporarily unavailable. Your saved draft is unchanged; check again shortly."); }
  }
  useEffect(() => {
    if (disabled || !draft.documentVersionId || selected?.status === "clean" || selected?.status === "rejected" || selected?.scanState === "dead_letter") return;
    let stopped = false; let attempts = 0;
    const timer = setInterval(async () => {
      if (++attempts > 60) { clearInterval(timer); return; }
      try {
        const next = leaseSetupStateSchema.parse(await jsonRequest(savedUrl));
        if (!stopped) setServer(current => ({ ...current, documents: next.documents, localDate: next.localDate }));
      } catch { /* The manual status button stays available; never replace edited fields. */ }
    }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [disabled, draft.documentVersionId, selected?.status, selected?.scanState, savedUrl]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function textField(label: string, key: "householdName" | "startDate" | "endDate" | "rentAmount" | "openingBalance" | "firstChargeDueDate", type = "text") {
    return <div className="space-y-2"><Label htmlFor={`lease-${key}`}>{label}</Label><Input id={`lease-${key}`} type={type}
      value={draft[key]} inputMode={key === "rentAmount" || key === "openingBalance" ? "decimal" : undefined}
      onChange={event => edit({ [key]: event.target.value })} /></div>;
  }
  if (server.result) return <LeaseSetupComplete result={server.result} organizationId={organizationId} unitId={unitId} />;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <p className="flex-1 text-sm">{dirty ? "You have unsaved changes." : server.revision ? "Your last saved draft is available on your account." : "Save a draft to resume later."}</p>
      <Button type="button" variant="outline" disabled={disabled || busy || uncertain === "activation"} onClick={() => void save()}>{uncertain === "save" ? "Retry same save" : "Save draft"}</Button>
      <Button type="button" variant="ghost" disabled={disabled || busy} onClick={() => void loadSaved()}>Load saved version</Button>
    </div>
    <p className="text-xs text-muted-foreground">Loading the saved version replaces unsaved local edits. This setup does not publish a listing.</p>
    {error && <p role="alert" className="break-words rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {uncertain && <p className="rounded-xl border p-4 text-sm">The last {uncertain} result is uncertain. Retry the same operation or load its saved result before editing. Do not start another tenancy.</p>}
    <form onSubmit={event => { event.preventDefault(); void save(true); }} className="space-y-6">
      <fieldset disabled={locked} className="space-y-6">
        <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Who is renting the space?</h2>
          {textField("Household name", "householdName")}
          <p className="text-xs text-muted-foreground">For example, Jamie Example household. This labels the rental records; it does not change the lease.</p>
          {draft.members.map((member, index) => <div key={index} className="space-y-4 border-t pt-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Renter {index + 1}</h3>
              {draft.members.length > 1 && <Button type="button" variant="ghost" onClick={() => {
                const remaining = draft.members.filter((_, i) => i !== index);
                if (member.primaryContact) remaining[0] = { ...remaining[0], primaryContact: true };
                edit({ members: remaining });
              }}>Remove renter {index + 1}</Button>}</div>
            <div className="grid gap-4 sm:grid-cols-2">{([['firstName','First name'],['lastName','Last name'],['email','Email'],['phoneE164','Phone (optional)']] as const).map(([key, label]) =>
              <div key={key} className="space-y-2"><Label htmlFor={`renter-${index}-${key}`}>{label} — renter {index + 1}</Label>
                <Input id={`renter-${index}-${key}`} type={key === "email" ? "email" : "text"} value={member[key]}
                  onChange={event => edit({ members: draft.members.map((m, i) => i === index ? { ...m, [key]: event.target.value } : m) })} /></div>)}</div>
            <div className="flex flex-wrap gap-4 text-sm"><label className="flex min-h-11 items-center gap-2"><input type="radio" name="primary-renter" checked={member.primaryContact}
              onChange={() => edit({ members: draft.members.map((m, i) => ({ ...m, primaryContact: i === index })) })} />Primary contact</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={member.financiallyResponsible}
                onChange={event => edit({ members: draft.members.map((m, i) => i === index ? { ...m, financiallyResponsible: event.target.checked } : m) })} />Financially responsible</label></div>
          </div>)}
          <Button type="button" variant="outline" disabled={draft.members.length >= 12} onClick={() => edit({ members: [...draft.members,
            { firstName: "", lastName: "", email: "", phoneE164: "", primaryContact: false, financiallyResponsible: false }] })}>Add another renter</Button>
        </section>
        <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">The signed agreement</h2>
          <p className="text-sm leading-6 text-muted-foreground">Use the agreement already signed by the required parties. Crecy records your supplied agreement; it does not generate or certify its legal terms.</p>
          <div className="space-y-2"><Label htmlFor="lease-agreement-file">Upload a signed agreement</Label>
            <Input id="lease-agreement-file" type="file" ref={fileRef} accept={AGREEMENT_TYPES.join(",")} />
            <p className="text-xs text-muted-foreground">PDF, Word, PNG or JPEG; up to 25 MB. Files stay private and must pass scanning.</p></div>
          <Button type="button" variant="outline" onClick={() => void uploadAgreement()}>Upload agreement securely</Button>
          {draft.upload && <div className="space-y-3 rounded-lg border p-4"><p className="break-words text-sm">Upload awaiting verification: {draft.upload.filename}</p>
            <Button type="button" variant="outline" onClick={() => void resumeUpload()}>Finish upload verification</Button>
            <p className="text-xs text-muted-foreground">An interrupted transfer may need the file selected again. A completed upload will reuse its receipt.</p></div>}
          <div className="space-y-2"><Label htmlFor="lease-selected-agreement">Or select an agreement already uploaded</Label>
            <NativeSelect id="lease-selected-agreement" value={draft.documentVersionId} onChange={event => edit({ documentVersionId: event.target.value, upload: null })}>
              <option value="">Choose a signed agreement</option>{server.documents.map(doc => <option key={doc.versionId} value={doc.versionId}>{doc.filename} — {doc.status}</option>)}
            </NativeSelect></div>
          {draft.documentVersionId && <div className="space-y-2" aria-live="polite"><p className="text-sm">{selected?.status === "clean" ? "Agreement ready: the selected version passed scanning." : selected?.status === "rejected" ? "This file was rejected. Choose a different signed copy." : selected?.scanState === "dead_letter" ? "Scanning could not finish. Upload a fresh copy or contact support." : "Agreement is awaiting scan completion. Your saved draft is retained."}</p>
            <Button type="button" variant="ghost" onClick={() => void checkScan()}>Check scan status</Button></div>}
        </section>
        <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Dates and rent</h2>
          <div className="space-y-2"><Label htmlFor="lease-occupancy">Has this signed rental started?</Label>
            <NativeSelect id="lease-occupancy" value={draft.occupancy} onChange={event => edit({ occupancy: event.target.value as HomeownerLeaseDraft["occupancy"] })}>
              <option value="existing">Yes, the rental has already started</option><option value="future">No, the signed rental starts later</option></NativeSelect></div>
          <div className="grid gap-4 sm:grid-cols-2">{textField("Lease start date", "startDate", "date")}{textField("Lease end date (optional)", "endDate", "date")}
            {textField(`Rent amount (${server.currency})`, "rentAmount")}
            <div className="space-y-2"><Label htmlFor="lease-frequency">Rent frequency</Label><NativeSelect id="lease-frequency" value={draft.rentFrequency} onChange={event => edit({ rentFrequency: event.target.value as HomeownerLeaseDraft["rentFrequency"] })}>
              <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="quarterly">Quarterly</option><option value="semiannual">Twice yearly</option><option value="annual">Annually</option></NativeSelect></div>
          </div>
        </section>
        <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Where should Crecy begin?</h2>
          <p className="text-sm leading-6 text-muted-foreground">Do not create old rent charges for amounts already paid elsewhere. Choose the first charge Crecy should manage, then record any earlier outstanding balance or credit separately.</p>
          <div className="grid gap-4 sm:grid-cols-2">{textField("First rent charge managed in Crecy", "firstChargeDueDate", "date")}{textField(`Opening balance (${server.currency})`, "openingBalance")}</div>
          <p className="text-xs leading-6 text-muted-foreground">First charge: today or later in the property’s local time, within the lease. Opening balance: 0 when nothing is owed; positive for money owed; negative for a renter credit. This does not collect a deposit or charge a card.</p>
        </section>
      </fieldset>
      <Button type="submit" className="w-full" disabled={locked}>{busy ? "Saving…" : "Save and review rental"}</Button>
    </form>
    {reviewing && <section className="space-y-5 rounded-xl border border-primary/30 bg-card p-5 sm:p-6" aria-label="Review signed rental">
      <h2 className="text-xl font-semibold">Review before activation</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Household</dt><dd className="mt-1 break-words font-medium">{draft.householdName}</dd></div>
        <div><dt className="text-muted-foreground">Signed agreement</dt><dd className="mt-1 break-words font-medium">{selected?.filename}</dd></div>
        <div><dt className="text-muted-foreground">Lease dates</dt><dd className="mt-1 font-medium">{draft.startDate} to {draft.endDate || "ongoing"}</dd></div>
        <div><dt className="text-muted-foreground">Rent</dt><dd className="mt-1 font-medium">{server.currency} {draft.rentAmount} · {draft.rentFrequency}</dd></div>
        <div><dt className="text-muted-foreground">First charge in Crecy</dt><dd className="mt-1 font-medium">{draft.firstChargeDueDate}</dd></div>
        <div><dt className="text-muted-foreground">Opening balance</dt><dd className="mt-1 font-medium">{server.currency} {draft.openingBalance}</dd></div></dl>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1.5" type="checkbox" checked={agreementConfirmed} disabled={locked}
        onChange={event => setAgreementConfirmed(event.target.checked)} />The required parties have signed this agreement, and the entered terms match it.</label>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1.5" type="checkbox" checked={openingConfirmed} disabled={locked}
        onChange={event => setOpeningConfirmed(event.target.checked)} />I have checked the opening balance and first charge date, excluding amounts already paid.</label>
      <Button type="button" className="w-full" disabled={disabled || busy || !openingConfirmed || !agreementConfirmed || uncertain === "save"}
        onClick={() => void activate()}>{uncertain === "activation" ? "Retry same activation" : "Confirm and activate signed rental"}</Button>
    </section>}
  </div>;
}
