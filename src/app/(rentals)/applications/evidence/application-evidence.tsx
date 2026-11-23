"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MfaSetup } from "@/app/settings/security/mfa/mfa-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { evidenceFileTypes, evidenceLabels, evidencePacketSchema, evidenceScoreSourceLabels, evidenceScoreSources,
  evidenceUploadGrantSchema, rentalEvidenceBucket, rentalEvidenceMaxBytes, type EvidencePacket, type EvidenceScoreSource,
  type EvidenceType } from "@/lib/validation/rental-evidence";

const api = "/api/v1/rental-applications/evidence";
class EvidenceRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function requestEvidence(url: string, command?: Record<string, unknown>) {
  const response = await fetch(url, command ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) }
    : { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new EvidenceRequestError(body?.error ?? "Private evidence could not be loaded.", body?.code);
  return body;
}

function ApplicantAccount({ email, returnTo }: { email: string; returnTo: string }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "new") {
        const result = await supabase.auth.signUp({ email, password,
          options: { emailRedirectTo: new URL(returnTo, window.location.origin).href } });
        if (result.error) throw new Error();
        if (!result.data.session) {
          setMessage("Check your email to finish setup, then return here to sign in.");
          return;
        }
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw new Error();
      }
      window.location.assign(returnTo);
    } catch {
      setMessage("Account access could not be confirmed. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4 rounded-xl border bg-card p-5">
    <p className="text-sm text-muted-foreground">Use your application email to secure access to these documents.</p>
    <form className="space-y-4" onSubmit={authenticate}>
      <div><Label htmlFor="evidence-account-email">Application email</Label><Input id="evidence-account-email" className="mt-2" value={email} readOnly /></div>
      <div><Label htmlFor="evidence-account-password">Password</Label><Input key={mode} id="evidence-account-password" name="password"
        className="mt-2" type="password" required minLength={mode === "new" ? 12 : undefined}
        autoComplete={mode === "new" ? "new-password" : "current-password"} /></div>
      <Button type="submit" disabled={busy}>{mode === "new" ? "Create applicant account" : "Sign in"}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setMode(mode === "new" ? "existing" : "new"); setMessage(""); }}>
        {mode === "new" ? "Use existing account" : "Create an account"}
      </Button>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </form>
  </div>;
}

export function ApplicationEvidence({ reference, returnTo, verifiedApplicationEmail }: {
  reference: string; returnTo: string; verifiedApplicationEmail?: string;
}) {
  if (verifiedApplicationEmail) return <ApplicantAccount email={verifiedApplicationEmail} returnTo={returnTo} />;
  return <PacketEditor reference={reference} returnTo={returnTo} />;
}

function PacketEditor({ reference, returnTo }: { reference: string; returnTo: string }) {
  const [packet, setPacket] = useState<EvidencePacket | null>(null);
  const [error, setError] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [score, setScore] = useState("");
  const [scoreSource, setScoreSource] = useState<EvidenceScoreSource | "">("");
  const [scoreObservedOn, setScoreObservedOn] = useState("");
  const [acknowledgeRequirementsChange, setAcknowledgeRequirementsChange] = useState(false);
  const [alternatives, setAlternatives] = useState<EvidenceType[]>([]);
  const [documentType, setDocumentType] = useState<EvidenceType | "">("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const update = useCallback((incoming: unknown) => {
    const parsed = evidencePacketSchema.parse(incoming);
    setPacket(parsed);
    setConsent(parsed.consented === true);
    setScore(parsed.score === null ? "" : String(parsed.score));
    setScoreSource(parsed.scoreSource ?? "");
    setScoreObservedOn(parsed.scoreObservedOn ?? "");
    setAcknowledgeRequirementsChange(false);
    setAlternatives(parsed.alternativeDocumentTypes);
    setDocumentType((value) => value && parsed.allowedDocumentTypes.includes(value) ? value : parsed.allowedDocumentTypes[0] ?? "");
  }, []);
  const report = useCallback((cause: unknown) => {
    if (cause instanceof EvidenceRequestError && cause.code === "EVIDENCE_RECENT_MFA_REQUIRED") setNeedsMfa(true);
    else setError(cause instanceof EvidenceRequestError ? cause.message : "The packet could not be updated.");
  }, []);
  const refresh = useCallback(async () => {
    try { update(await requestEvidence(`${api}?ref=${reference}`)); }
    catch (cause) { report(cause); }
  }, [reference, report, update]);
  useEffect(() => {
    let active = true;
    void requestEvidence(`${api}?ref=${reference}`).then((data) => { if (active) update(data); })
      .catch((cause: unknown) => { if (active) report(cause); });
    return () => { active = false; };
  }, [reference, report, update]);

  async function perform(command: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { update(await requestEvidence(api, { reference, ...command })); }
    catch (cause) { report(cause); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (busy || !packet || !file || !documentType) return;
    const contentType = evidenceFileTypes.find((type) => type === file.type);
    if (!contentType || file.size < 1 || file.size > rentalEvidenceMaxBytes) {
      setError("Choose a PDF, JPEG, or PNG up to 8 MB."); return;
    }
    setBusy(true);
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const fileId = crypto.randomUUID();
      const grant = evidenceUploadGrantSchema.parse(await requestEvidence(api, { action: "start", reference, version: packet.version,
        fileId, documentType, contentType, sizeBytes: file.size, sha256 }));
      if (grant.id !== fileId) throw new Error();
      const uploadResult = await createClient().storage.from(rentalEvidenceBucket).upload(grant.objectKey, bytes,
        { contentType, upsert: false, cacheControl: "0" });
      if (uploadResult.error) throw new EvidenceRequestError("The file could not be uploaded. Remove the pending upload and retry.");
      await requestEvidence(api, { action: "finalize", reference, fileId });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (cause) { report(cause); }
    finally { await refresh(); setBusy(false); }
  }

  if (needsMfa) return <MfaSetup returnTo={returnTo} requireChallenge />;
  if (!packet) return <p role={error ? "alert" : "status"} className="text-sm">{error || "Opening your packet…"}</p>;
  if (!packet.bound) return <div className="space-y-4"><p className="text-sm">Link this account to the application you verified.</p>
    <Button disabled={busy} onClick={() => void perform({ action: "bind" })}>Link this application</Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>;
  const editable = packet.status === "draft" || packet.status === "changes_requested";
  const requirementsChanged = packet.currentRequirementsVersion !== packet.requirements.requirementsVersion;

  return <div className="space-y-6">
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Application requirements</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{packet.requirements.criteriaText}</p>
      {packet.requirements.requiredDocumentTypes.length ? <ul className="list-inside list-disc text-sm">
        {packet.requirements.requiredDocumentTypes.map((type) => <li key={type}>{evidenceLabels[type]}</li>)}</ul> : null}
      {packet.requirements.acceptedAlternatives ? <p className="whitespace-pre-wrap break-words text-sm">{packet.requirements.acceptedAlternatives}</p> : null}
      {requirementsChanged ? <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
        <p>The landlord updated the listing after you applied. The requirements shown here still apply to this application.</p>
        {editable ? <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledgeRequirementsChange}
          onChange={(event) => setAcknowledgeRequirementsChange(event.target.checked)} /> I understand the listing has changed.</label> : null}
      </div> : null}
      {packet.requestedDocumentTypes.length ? <p className="text-sm font-medium">The landlord requested changes to {packet.requestedDocumentTypes.map((type) => evidenceLabels[type].toLowerCase()).join(", ")}.</p> : null}
    </section>
    {editable ? <section className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Share your documents</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{packet.noticeText}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I agree to share the information described above.</label>
      {packet.allowScore ? <div><Label htmlFor="evidence-score">Self-reported credit score (optional, unverified)</Label>
        <Input id="evidence-score" className="mt-2 max-w-36" type="number" inputMode="numeric" min={1} max={999}
          value={score} onChange={(event) => setScore(event.target.value)} /></div> : null}
      {packet.allowScore && score ? <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="evidence-score-source">Score source (optional)</Label><select id="evidence-score-source" className="mt-2 block max-w-full rounded-md border p-2 text-base"
          value={scoreSource} onChange={(event) => setScoreSource(evidenceScoreSources.find((source) => source === event.target.value) ?? "")}>
          <option value="">Choose the source</option>
          {evidenceScoreSources.map((source) => <option key={source} value={source}>{evidenceScoreSourceLabels[source]}</option>)}</select></div>
        <div><Label htmlFor="evidence-score-observed">Score date (optional)</Label><Input id="evidence-score-observed" className="mt-2"
          type="date" max={new Date().toISOString().slice(0, 10)} value={scoreObservedOn} onChange={(event) => setScoreObservedOn(event.target.value)} /></div>
      </div> : null}
      {packet.requirements.acceptedAlternatives ? <fieldset className="space-y-2 text-sm"><legend className="font-medium">I’d like to use the listed alternative for</legend>
        {packet.requirements.requiredDocumentTypes.map((type) => <label key={type} className="flex items-center gap-2">
          <input type="checkbox" checked={alternatives.includes(type)} onChange={(event) => setAlternatives((previous) => event.target.checked
            ? [...previous, type] : previous.filter((item) => item !== type))} /> {evidenceLabels[type]}</label>)}</fieldset> : null}
      <Button variant="outline" disabled={busy || !consent} onClick={() => void perform({ action: "save", version: packet.version,
        score: score === "" ? null : Number(score), scoreSource: score ? scoreSource || null : null,
        scoreObservedOn: score ? scoreObservedOn || null : null, alternativeDocumentTypes: alternatives, noticeVersion: packet.noticeVersion,
        noticeSha256: packet.noticeSha256 })}>Save draft</Button>
    </section> : null}
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Your files</h2>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { setError(""); void refresh(); }}>Refresh scan status</Button></div>
      <ul className="space-y-2 text-sm">{packet.files.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3">
        <span>{evidenceLabels[item.documentType]} · {item.status.replaceAll("_", " ")}</span>
        {item.status === "clean" ? <a className="text-primary underline" href={`${api}/file?ref=${reference}&fileId=${item.id}`}>Download</a> : null}
        {editable ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void perform({ action: "remove", fileId: item.id, version: packet.version })}>Remove</Button> : null}
      </li>)}</ul>
      {editable && packet.consented && consent ? <div className="space-y-3">
        <Label htmlFor="evidence-document-type">Document type</Label><select id="evidence-document-type" className="block max-w-full rounded-md border p-2 text-sm"
          value={documentType} onChange={(event) => setDocumentType(packet.allowedDocumentTypes.find((type) => type === event.target.value) ?? "")}>
          {packet.allowedDocumentTypes.map((type) => <option key={type} value={type}>{evidenceLabels[type]}</option>)}</select>
        <p className="text-sm text-muted-foreground">Redact sensitive account or government identification numbers in the file before uploading.</p>
        <Input ref={fileInput} aria-label="Application document" type="file" accept={evidenceFileTypes.join(",")}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <Button variant="outline" disabled={busy || !file || !documentType} onClick={() => void upload()}>Upload document</Button>
      </div> : null}
    </section>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {editable ? <Button disabled={busy || !packet.consented || !consent || (requirementsChanged && !acknowledgeRequirementsChange)}
      onClick={() => void perform({ action: "submit", version: packet.version, acknowledgeRequirementsChange,
        currentRequirementsVersion: packet.currentRequirementsVersion })}>Submit for landlord review</Button>
      : <p role="status" className="text-sm font-medium">{packet.status === "selected" ? "The landlord selected your application for lease preparation." : "Your packet is submitted for landlord review."}</p>}
  </div>;
}
