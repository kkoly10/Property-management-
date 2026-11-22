import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AgreementIssueForm } from "@/components/agreements/agreement-forms";
import { Button } from "@/components/ui/button";
import { getAgreementIssueOptions, getRentalApplicationSigningSetup } from "@/lib/data/rental-agreements";

export const dynamic = "force-dynamic";

export default async function RentalApplicationAgreementPage({ params }: {
  params: Promise<{ unitId: string; applicationId: string }>;
}) {
  const { unitId, applicationId } = await params;
  if (!z.uuid().safeParse(unitId).success || !z.uuid().safeParse(applicationId).success) notFound();
  const result = await getRentalApplicationSigningSetup(applicationId, unitId);
  const applications = `/app/rentals/${unitId}/applications`;
  if (result.mode !== "ready") return <main className="mx-auto max-w-3xl space-y-4">
    <Link href={applications} className="text-sm text-primary">Back to applications</Link>
    <h1 className="text-2xl font-semibold">Agreement signing</h1>
    <p role="alert">{result.mode === "error" ? "The signing form is unavailable. Refresh and try again."
      : "Open the prepared application in its original workspace with the verified owner account."}</p>
  </main>;

  const { setup, organizationId } = result;
  const options = setup.agreementId ? null : await getAgreementIssueOptions(organizationId);
  const unit = options?.units.find((candidate) => candidate.id === unitId);
  const filtered = options && unit ? {
    mfaVerified: options.mfaVerified,
    units: [unit],
    documents: options.documents.filter((doc) => doc.propertyId === unit.propertyId && (!doc.unitId || doc.unitId === unit.id)),
  } : null;

  return <main className="mx-auto max-w-3xl space-y-5">
    <Link href={applications} className="text-sm text-primary">Back to applications</Link>
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h1 className="text-2xl font-semibold">Agreement signing</h1>
      {setup.agreementId ? (
        <Button asChild><Link href={`/app/agreements/${setup.agreementId}`}>Open signing request</Link></Button>
      ) : filtered ? (
        <AgreementIssueForm options={filtered} organizationId={organizationId} agreementId={crypto.randomUUID()}
          application={setup} returnTo={`${applications}/${applicationId}/agreement`} />
      ) : <p role="alert">Agreement PDF options could not be loaded for this rental.</p>}
    </section>
  </main>;
}
