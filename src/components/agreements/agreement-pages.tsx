import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAgreementFiling, getAgreementInvitationDelivery, getAgreementIssueOptions, getRentalAgreement, listRentalAgreements, type AgreementSurface } from "@/lib/data/rental-agreements";
import { ResidentMoveInChecklist } from "@/components/living/resident-move-in-checklist";
import { getResidentMoveInChecklist } from "@/lib/data/resident-move-in";
import { resolveEsignConsent } from "@/lib/data/signatures";
import { hostConfig } from "@/lib/runtime/host";
import { AgreementCloseForm, AgreementFilingForm, AgreementInvitationResendForm, AgreementIssueForm, AgreementSignatureForm } from "./agreement-forms";

const labels = { open: "Awaiting signatures", executed: "All parties signed", declined: "Declined", void: "Voided", expired: "Expired" };
const invitationLabels = {
  queued: "Queued",
  accepted: "Accepted by email provider",
  delivered: "Delivered to mail server",
  delayed: "Delayed",
  failed: "Failed",
};
const paths = { operator: "/app/agreements", participant: "/documents/agreements" };

function AgreementUnavailable({ mode, next }: { mode: string; next: string }) {
  if (mode === "signedOut") return <Button asChild><Link href={"/login?next=" + encodeURIComponent(next)}>Sign in to view agreements</Link></Button>;
  const message = mode === "setup" ? "Connect Supabase to manage rental agreements."
    : mode === "noWorkspace" ? "Select an active workspace to view its agreements."
      : mode === "missing" ? "This agreement is unavailable to your account."
        : "Rental agreements could not be loaded. Refresh and try again.";
  return <p role={mode === "error" ? "alert" : undefined} className="rounded-xl border p-4 text-sm">{message}</p>;
}

export async function AgreementList({ surface }: { surface: AgreementSurface }) {
  const result = await listRentalAgreements(surface);
  const path = paths[surface];
  const options = result.mode === "ready" && result.organizationId
    ? await getAgreementIssueOptions(result.organizationId)
    : null;

  return <div className="mx-auto max-w-4xl space-y-6">
    <header>
      <h1 className="text-3xl font-semibold tracking-tight">Rental agreements</h1>
      {surface === "operator" ? <p className="mt-2 text-sm text-muted-foreground">Share an agreement PDF for electronic signatures and track each signing request.</p> : null}
    </header>
    {result.mode !== "ready" ? <AgreementUnavailable mode={result.mode} next={path} />
      : <>
        {result.agreements.length ? <ul className="divide-y rounded-xl border bg-card">
          {result.agreements.map((item) => <li key={item.agreementId}>
            <Link href={path + "/" + item.agreementId} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40">
              <span className="min-w-0 break-words"><strong>{item.title}</strong><span className="mt-1 block text-sm text-muted-foreground">{item.propertyLabel} · {item.unitLabel}</span></span>
              <span className="text-sm">{labels[item.status]} · {item.signedCount}/{item.requiredCount} signed</span>
            </Link>
          </li>)}
        </ul> : <p className="rounded-xl border p-4 text-sm text-muted-foreground">{surface === "operator" ? "This workspace has no signing requests yet." : "You have no signing requests."}</p>}
        {surface === "operator" && result.organizationId ? <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Create a signing request</h2>
          {options ? <AgreementIssueForm options={options} organizationId={result.organizationId} agreementId={crypto.randomUUID()} />
            : <p role="alert" className="text-sm text-destructive">Rental and PDF options could not be loaded.</p>}
        </section> : null}
      </>}
  </div>;
}

export async function AgreementDetail({ surface, agreementId }: { surface: AgreementSurface; agreementId: string }) {
  const path = paths[surface];
  const result = await getRentalAgreement(surface, agreementId);
  if (result.mode !== "ready") return <div className="mx-auto max-w-4xl space-y-4">
    <Button asChild variant="ghost"><Link href={path}>Back to rental agreements</Link></Button>
    <h1 className="text-3xl font-semibold">Rental agreement</h1>
    <AgreementUnavailable mode={result.mode} next={path + "/" + agreementId} />
  </div>;

  const { agreement, organizationId } = result;
  const consent = resolveEsignConsent();
  const open = agreement.status === "open";
  const executed = agreement.status === "executed";
  const [filing, invitation, moveIns] = await Promise.all([
    executed && organizationId ? getAgreementFiling(organizationId, agreement.agreementId) : null,
    surface === "operator" && organizationId && agreement.applicationLinked
      ? getAgreementInvitationDelivery(organizationId, agreement.agreementId) : null,
    surface === "participant" && executed && agreement.applicationLinked && agreement.myCapacity === "lessee"
      ? getResidentMoveInChecklist(agreement.agreementId) : [],
  ]);
  const maySign = open && agreement.myCapacity && !agreement.iSigned && consent;
  const artifacts = "/api/v1/rental-agreements/" + agreement.agreementId + "/artifacts?surface=" + surface;
  const participantUrl = "https://" + hostConfig().livingRoot + paths.participant + "/" + agreement.agreementId;
  const mfaHref = "/settings/security/mfa?returnTo=" + encodeURIComponent(path + "/" + agreement.agreementId);
  const receiptStatus = agreement.tenancyStatus === "scheduled" ? "Tenancy scheduled"
    : agreement.tenancyStatus === "closed" ? "Tenancy closed"
      : agreement.tenancyStatus === "active" ? "Tenancy active"
        : agreement.tenancyStatus ? "Tenancy recorded" : "Tenancy setup pending";
  return <div className="mx-auto max-w-4xl space-y-6">
    <Button asChild variant="ghost"><Link href={path}>Back to rental agreements</Link></Button>
    <header className="space-y-2">
      <h1 className="break-words text-3xl font-semibold tracking-tight">{agreement.title}</h1>
      <p className="text-sm text-muted-foreground">{agreement.propertyLabel} · {agreement.unitLabel}</p>
      <p className="text-sm font-medium">{labels[agreement.status]} · {agreement.signedCount} of {agreement.requiredCount} signed</p>
      {open ? <p className="text-sm">Sign by <time dateTime={agreement.expiresAt}>{new Date(agreement.expiresAt).toISOString().slice(0, 16).replace("T", " ")} UTC</time></p> : null}
    </header>
    {open || executed ? <div className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><a href={artifacts + "&kind=source"}>Download agreement PDF</a></Button>
      {executed ? <Button asChild variant="outline"><a href={artifacts + "&kind=evidence"}>Download signature record</a></Button> : null}
    </div> : null}
    {executed && <section className="space-y-3 rounded-xl border p-4" aria-label="Signed agreement receipt">
      <h2 className="font-semibold">Signed agreement receipt</h2>
      {agreement.applicationLinked && <p className="text-sm">{receiptStatus}</p>}
      <Button asChild><a href={artifacts + "&kind=bundle"}>Download signed package</a></Button>
    </section>}
    {moveIns.map((moveIn) => <ResidentMoveInChecklist key={moveIn.tenancyId} moveIn={moveIn} />)}
    {surface === "operator" && agreement.applicationLinked && (open || invitation?.state || invitation?.reissue)
      ? <section className="space-y-3 rounded-xl border p-4" aria-label="Renter signing invitation">
      <h2 className="font-semibold">Renter signing invitation</h2>
      <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Email delivery</dt>
        <dd className="font-medium">{invitation?.state ? invitationLabels[invitation.state] : "Status unavailable"}</dd>
      </dl>
      {open && organizationId && invitation?.resendEligible ? <>
        <p className="text-sm text-muted-foreground">Resending requires <Link className="underline" href={mfaHref}>MFA verification</Link>.</p>
        <AgreementInvitationResendForm agreementId={agreement.agreementId} organizationId={organizationId} operationId={crypto.randomUUID()} />
      </> : null}
      {agreement.status === "expired" && invitation?.reissue && <>
        <p className="text-sm text-muted-foreground">Return to the application to send a fresh signing request.</p>
        <Button asChild variant="outline"><Link href={`/app/rentals/${invitation.reissue.unitId}/applications/${invitation.reissue.applicationId}/agreement`}>
          Return to application signing
        </Link></Button>
      </>}
    </section> : null}
    {surface === "operator" && open && !agreement.applicationLinked ? <section className="space-y-2 rounded-xl border p-4">
      <h2 className="font-semibold">Link for renters</h2>
      <p className="break-all text-sm"><a className="underline" href={participantUrl}>{participantUrl}</a></p>
      <p className="text-sm text-muted-foreground">Share this link with the renters you named. Each renter signs in with their own verified account.</p>
    </section> : null}
    {filing && organizationId ? <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Tenancy setup</h2>
      {filing.tenancyId ? <Button asChild variant="outline"><Link href={`/app/tenancies/${filing.tenancyId}/move-in`}>Open exact tenancy</Link></Button>
        : filing.documentId ? <>
          <p className="text-sm text-muted-foreground">{filing.applicationId
            ? "Continue the linked setup and review the signed PDF and confirmed terms."
            : "Choose this agreement in tenancy setup. Enter the verified signing addresses for the responsible renters."}</p>
          {filing.applicationId ? filing.applicationSetupId ? (
            <Button asChild><Link href={`/app/rentals/${filing.unitId}/setup?setupId=${filing.applicationSetupId}`}>Continue application lease setup</Link></Button>
          ) : <p className="text-sm">The original application lease setup is unavailable to this account.</p>
          : <Button asChild><Link href={"/app/leases/record?propertyId=" + filing.propertyId + "&unitId=" + filing.unitId}>Continue to tenancy setup</Link></Button>}
        </> : <>
          <p className="text-sm text-muted-foreground"><Link className="underline" href={mfaHref}>Verify with MFA</Link> to file the agreement.</p>
          <AgreementFilingForm agreementId={agreement.agreementId} organizationId={organizationId} />
        </>}
    </section> : null}
    {agreement.iSigned ? <p role="status" className="rounded-xl border p-4 text-sm">Your signature is recorded.</p> : null}
    {surface === "participant" && agreement.status === "expired" ? <p className="text-sm text-muted-foreground">
      Contact your landlord for a new signing invitation.
    </p> : null}
    {maySign ? <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{agreement.myCapacity === "landlord" ? "Sign as landlord" : "Sign as renter"}</h2>
      {agreement.myCapacity === "landlord" ? <p className="text-sm text-muted-foreground"><Link className="underline" href={mfaHref}>Verify with MFA</Link> before signing.</p> : null}
      <AgreementSignatureForm agreement={agreement} consent={consent} surface={surface} organizationId={organizationId} />
    </section> : null}
    {open && surface === "operator" ? <AgreementCloseForm agreementId={agreement.agreementId} organizationId={organizationId} actionKind="void" /> : null}
    {open && surface === "participant" && agreement.myCapacity === "lessee" && !agreement.iSigned
      ? <AgreementCloseForm agreementId={agreement.agreementId} organizationId={null} actionKind="declined" /> : null}
  </div>;
}
