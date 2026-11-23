"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { closeAgreementAction, issueAgreementAction, issueApplicationAgreementAction, resendAgreementInvitationAction, signAgreementAction } from "@/lib/agreements/actions";
import { fileAgreementAction } from "@/lib/agreements/filing-actions";
import type { AgreementSummary, AgreementSurface, ApplicationSigningSetup, getAgreementIssueOptions } from "@/lib/data/rental-agreements";
import type { EsignConsentSummary } from "@/lib/data/signatures";

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-destructive" : "text-sm"}>{state.message}</p>;
}

export function AgreementInvitationResendForm({ agreementId, organizationId, operationId }: {
  agreementId: string;
  organizationId: string;
  operationId: string;
}) {
  const [state, action, busy] = useActionState(resendAgreementInvitationAction, initialActionState);
  return <form action={action} className="space-y-3 border-t pt-3">
    <input type="hidden" name="agreementId" value={agreementId} />
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="operationId" value={operationId} />
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="confirmed" className="mt-1 h-4 w-4 shrink-0 accent-primary" required />
      <span>Send a fresh link to the verified application email. The previous invitation link will stop working.</span>
    </label>
    <Button type="submit" variant="outline" disabled={busy}>{busy ? "Queuing invitation…" : "Resend signing invitation"}</Button>
    <ActionMessage state={state} />
  </form>;
}

type IssueOptions = NonNullable<Awaited<ReturnType<typeof getAgreementIssueOptions>>>;

export function AgreementIssueForm({ options, organizationId, agreementId, application, returnTo = "/app/agreements" }: {
  options: IssueOptions; organizationId: string; agreementId: string; application?: ApplicationSigningSetup; returnTo?: string;
}) {
  const [state, action, pending] = useActionState(application ? issueApplicationAgreementAction : issueAgreementAction, initialActionState);
  const [unitId, setUnitId] = useState(application?.unitId ?? "");
  const unit = options.units.find((candidate) => candidate.id === unitId);
  const versions = unit ? options.documents.filter((document) => document.propertyId === unit.propertyId && (!document.unitId || document.unitId === unit.id)) : [];

  if (!options.units.length || !options.documents.length) {
    return <p className="text-sm text-muted-foreground">{application ? "Upload a " : "Add an active rental and upload a "}
      <Link className="font-medium underline" href="/app/documents">rental agreement PDF</Link> for its property or unit. It will appear here once it passes the scan.</p>;
  }

  if (!options.mfaVerified) {
    return <Button asChild variant="outline"><Link href={`/settings/security/mfa?returnTo=${encodeURIComponent(returnTo)}`}>Verify with MFA to issue an agreement</Link></Button>;
  }

  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="agreementId" value={agreementId} />
    {application ? <>
      <input type="hidden" name="applicationId" value={application.applicationId} />
      <input type="hidden" name="setupId" value={application.setupId} />
      <input type="hidden" name="applicationVersion" value={application.applicationVersion} />
      <input type="hidden" name="setupRevision" value={application.setupRevision} />
      <div className="grid gap-2">
        <p className="font-medium">{unit?.property} · {unit?.code}</p>
        <p className="break-words text-sm text-muted-foreground">{application.name} · {application.email}</p>
      </div>
      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <h2 className="font-medium">Lease terms to approve</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Lease dates</dt><dd>{application.terms.startDate || "Choose a start date"} · {application.terms.endDate || "No end date entered"}</dd></div>
          <div><dt className="text-muted-foreground">Rent</dt><dd>{application.terms.rentAmount || "Enter rent"} {application.terms.currency} · {application.terms.rentFrequency}</dd></div>
          <div><dt className="text-muted-foreground">First charge</dt><dd>{application.terms.firstChargeDueDate || "Choose a first charge date"}</dd></div>
          <div><dt className="text-muted-foreground">Opening balance</dt><dd>{application.terms.openingBalance || "Enter a balance"} {application.terms.currency}</dd></div>
        </dl>
        <Link className="inline-block text-sm underline" href={`/app/rentals/${application.unitId}/setup?setupId=${application.setupId}`}>Edit lease terms</Link>
      </div>
    </> : <div className="grid gap-2">
      <Label htmlFor="agreement-unit">Rental</Label>
      <NativeSelect id="agreement-unit" name="unitId" value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
        <option value="">Choose a rental</option>
        {options.units.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.property} · {candidate.code}</option>)}
      </NativeSelect>
    </div>}
    <div className="grid gap-2">
      <Label htmlFor="agreement-version">Agreement PDF version</Label>
      <NativeSelect key={unitId} id="agreement-version" name="versionId" defaultValue="" required disabled={!versions.length}>
        <option value="">{unitId && !versions.length ? "No eligible PDFs for this rental" : "Choose the exact version"}</option>
        {versions.map((version) => <option key={version.id} value={version.id}>{version.title} · v{version.version} · {version.filename}</option>)}
      </NativeSelect>
    </div>
    {application ? null : <div className="grid gap-2">
      <Label htmlFor="agreement-emails">Renter email addresses</Label>
      <Textarea id="agreement-emails" name="emails" aria-describedby="agreement-emails-help" required maxLength={2200} rows={3} />
      <p id="agreement-emails-help" className="text-sm text-muted-foreground">Enter up to eight verified Crecy account addresses, one per line.</p>
    </div>}
    <div className="grid w-40 gap-2">
      <Label htmlFor="agreement-valid-days">Days to sign</Label>
      <Input id="agreement-valid-days" name="validDays" type="number" min={1} max={30} defaultValue={14} required />
    </div>
    {application && <p className="text-sm text-muted-foreground">The request expires by the lease start date.</p>}
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="authority" required />
      <span>I have authority to sign for this rental, and this PDF is for the renters listed above.</span>
    </label>
    {application && <label className="flex min-h-11 items-start gap-3 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="termsConfirmed" required />
      <span>The lease terms above match this PDF. I approve sending it to the verified applicant for signature.</span>
    </label>}
    <ActionMessage state={state} />
    <Button className="w-fit" type="submit" disabled={pending || !versions.length}>
      {pending ? "Saving signing request…" : application ? "Send agreement for signature" : "Create signing request"}
    </Button>
  </form>;
}

export function AgreementSignatureForm({ agreement, consent, surface, organizationId }: {
  agreement: AgreementSummary;
  consent: EsignConsentSummary;
  surface: AgreementSurface;
  organizationId: string | null;
}) {
  const [state, action, pending] = useActionState(signAgreementAction, initialActionState);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="surface" value={surface} />
    <input type="hidden" name="organizationId" value={organizationId ?? ""} />
    <input type="hidden" name="agreementId" value={agreement.agreementId} />
    <input type="hidden" name="versionId" value={agreement.sourceVersionId} />
    <input type="hidden" name="sha256" value={agreement.sourceSha256} />
    <input type="hidden" name="consentVersion" value={consent.version} />
    <div className="rounded-lg border bg-muted/30 p-4">
      <h3 className="font-medium">{consent.title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-6">{consent.body}</p>
    </div>
    <div className="grid gap-2">
      <Label htmlFor="agreement-signer-name">Full legal name</Label>
      <Input name="signerName" id="agreement-signer-name" autoComplete="name" minLength={2} maxLength={160} required />
    </div>
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" name="reviewed" type="checkbox" required />
      <span>I have read this version of the agreement PDF.</span>
    </label>
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" name="consented" type="checkbox" required />
      <span>I consent to the use of electronic records and signatures under the disclosure above.</span>
    </label>
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" name="intent" type="checkbox" required />
      <span>I have read and agree to this document, and I intend my electronic signature to bind me to it.</span>
    </label>
    <ActionMessage state={state} />
    <Button className="w-fit" type="submit" disabled={pending}>{pending ? "Saving signature…" : "Sign agreement"}</Button>
  </form>;
}

export function AgreementCloseForm({ agreementId, organizationId, actionKind }: {
  agreementId: string;
  organizationId: string | null;
  actionKind: "void" | "declined";
}) {
  const [state, action, pending] = useActionState(closeAgreementAction, initialActionState);
  const label = actionKind === "void" ? "Void signing request" : "Decline to sign";
  return <details className="rounded-xl border p-4">
    <summary className="cursor-pointer font-medium">{label}</summary>
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="organizationId" value={organizationId ?? ""} />
      <input type="hidden" name="closeAction" value={actionKind} />
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="confirmed" required />
        <span>I understand this ends the signing request for everyone.</span>
      </label>
      <ActionMessage state={state} />
      <Button variant="destructive" type="submit" disabled={pending}>{pending ? "Closing request…" : label}</Button>
    </form>
  </details>;
}

export function AgreementFilingForm({ agreementId, organizationId }: { agreementId: string; organizationId: string }) {
  const [state, action, pending] = useActionState(fileAgreementAction, initialActionState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="agreementId" value={agreementId} />
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="confirmFiling" required />
      <span>File this exact PDF and signature record for this rental. I will review the household and tenancy terms before activation.</span>
    </label>
    <ActionMessage state={state} />
    <Button variant="outline" type="submit" disabled={pending}>{pending ? "Filing…" : "File for tenancy setup"}</Button>
  </form>;
}
