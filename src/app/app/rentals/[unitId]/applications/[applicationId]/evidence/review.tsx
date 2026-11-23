"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MfaSetup } from "@/app/settings/security/mfa/mfa-setup";
import { Button } from "@/components/ui/button";
import { evidenceLabels, evidencePacketSchema, evidenceScoreSourceLabels, type EvidencePacket, type EvidenceType } from "@/lib/validation/rental-evidence";

const api = "/api/v1/rental-applications/evidence-review";
const statusLabels = { submitted: "Ready for review", changes_requested: "Changes requested", selected: "Selected for lease preparation", declined: "Declined" };
type Scope = { organizationId: string; unitId: string; applicationId: string };
type ReviewerPacket = EvidencePacket & { creditDecisionRestricted: boolean };

export function EvidenceReview({ scope }: { scope: Scope }) {
  const query = new URLSearchParams(scope).toString();
  const back = `/app/rentals/${scope.unitId}/applications`;
  const returnTo = `${back}/${scope.applicationId}/evidence`;
  const [packet, setPacket] = useState<ReviewerPacket | null>(null);
  const [decision, setDecision] = useState<keyof typeof statusLabels | null>(null);
  const [selected, setSelected] = useState<EvidenceType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stepUp, setStepUp] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${api}?${query}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (body?.code === "EVIDENCE_RECENT_MFA_REQUIRED") setStepUp(true);
          else setError(body?.error ?? "This packet is unavailable for review.");
          return;
        }
        if (body?.status === "declined" || body?.status === "changes_requested") { setDecision(body.status); return; }
        setPacket({ ...evidencePacketSchema.parse(body), creditDecisionRestricted: body?.creditDecisionRestricted === true });
      } catch {
        if (!controller.signal.aborted) setError("The packet could not be loaded.");
      }
    })();
    return () => controller.abort();
  }, [query]);

  async function review(action: "request_changes" | "select" | "decline") {
    if (!packet || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(api, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...scope, version: packet.version, action, documentTypes: selected }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.code === "EVIDENCE_RECENT_MFA_REQUIRED") setStepUp(true);
        else setError(body?.error ?? "The review could not be saved.");
        return;
      }
      const expected = { request_changes: "changes_requested", select: "selected", decline: "declined" } as const;
      if (body?.status !== expected[action] || body?.version !== packet.version + 1) throw new Error();
      setPacket(null);
      setDecision(expected[action]);
    } catch {
      setError("The review could not be confirmed. Refresh to check its status.");
    } finally { setBusy(false); }
  }

  if (stepUp) return <MfaSetup returnTo={returnTo} requireChallenge />;
  if (decision) return <p role="status" className="text-sm font-medium">{statusLabels[decision]}. <Link className="text-primary underline" href={back}>Return to applications</Link></p>;
  if (!packet) return <p role={error ? "alert" : "status"} className="text-sm">{error || "Loading the private packet…"}</p>;
  const hasCredit = packet.creditDecisionRestricted || packet.score !== null || packet.files.some((item) => item.documentType === "credit_evidence")
    || packet.requirements.requiredDocumentTypes.includes("credit_evidence");
  return <div className="space-y-6 rounded-xl border bg-card p-5">
    <p className="text-sm font-medium">{packet.status === "selected" ? statusLabels.selected : statusLabels.submitted}</p>
    <p className="whitespace-pre-wrap break-words text-sm">{packet.requirements.criteriaText}</p>
    {packet.score !== null ? <p className="text-sm">Self-reported credit score {packet.score} (unverified)
      {packet.scoreSource ? ` · ${evidenceScoreSourceLabels[packet.scoreSource]}` : ""}{packet.scoreObservedOn ? ` · ${packet.scoreObservedOn}` : ""}</p> : null}
    <ul className="space-y-2 text-sm">{packet.files.filter((item) => item.status === "clean").map((item) => <li key={item.id}>
      <a className="text-primary underline" href={`${api}/file?${query}&fileId=${item.id}`}>Download {evidenceLabels[item.documentType].toLowerCase()}</a>
    </li>)}</ul>
    {packet.alternativeDocumentTypes.length ? <p className="text-sm">Alternatives requested for {packet.alternativeDocumentTypes.map((type) => evidenceLabels[type].toLowerCase()).join(", ")}.</p> : null}
    {packet.status === "submitted" ? <>
      <fieldset className="space-y-2 text-sm"><legend className="font-semibold">Document checklist</legend>
        <p className="text-muted-foreground">Select the categories you reviewed to choose the applicant, or the categories to amend if you’re requesting changes.</p>
        {packet.allowedDocumentTypes.map((type) => <label key={type} className="flex items-center gap-2">
          <input type="checkbox" checked={selected.includes(type)} onChange={(event) => setSelected((previous) => event.target.checked
            ? [...previous, type] : previous.filter((item) => item !== type))} /> {evidenceLabels[type]}
        </label>)}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !packet.requirements.requiredDocumentTypes.every((type) => selected.includes(type))} onClick={() => void review("select")}>Select for lease preparation</Button>
        <Button variant="outline" disabled={busy || selected.length === 0} onClick={() => void review("request_changes")}>Request changes</Button>
        {!hasCredit ? <Button variant="ghost" disabled={busy} onClick={() => void review("decline")}>Record decline</Button> : null}
      </div>
      {hasCredit ? <p className="text-sm text-muted-foreground">A decision involving credit evidence requires your approved notice process.</p> : null}
    </> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
