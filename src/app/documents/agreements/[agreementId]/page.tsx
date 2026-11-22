import { AgreementDetail } from "@/components/agreements/agreement-pages";
import { LivingShell } from "@/components/living/living-shell";

export const dynamic = "force-dynamic";

export default async function ParticipantAgreementPage({ params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  return <LivingShell><AgreementDetail agreementId={agreementId} surface="participant" /></LivingShell>;
}
