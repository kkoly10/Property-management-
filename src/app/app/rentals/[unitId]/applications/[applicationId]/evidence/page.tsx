import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization/context";
import { rentalEvidenceEnabled } from "@/lib/rental-evidence/http";
import { evidenceReviewScopeSchema } from "@/lib/validation/rental-evidence";
import { EvidenceReview } from "./review";

export const dynamic = "force-dynamic";

export default async function ReviewApplicationEvidencePage({ params }: {
  params: Promise<{ unitId: string; applicationId: string }>;
}) {
  if (!rentalEvidenceEnabled()) notFound();
  const context = await getOrganizationContext();
  const scope = evidenceReviewScopeSchema.safeParse({ ...(await params), organizationId: context.active?.organizationId });
  if (!scope.success) notFound();
  return <main className="mx-auto max-w-3xl space-y-6">
    <Link href={`/app/rentals/${scope.data.unitId}/applications`} className="text-sm font-medium text-primary">Back to applications</Link>
    <h1 className="text-3xl font-semibold tracking-tight">Review application documents</h1>
    <EvidenceReview scope={scope.data} />
  </main>;
}
