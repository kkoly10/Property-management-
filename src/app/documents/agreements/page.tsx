import { AgreementList } from "@/components/agreements/agreement-pages";
import { LivingShell } from "@/components/living/living-shell";

export const dynamic = "force-dynamic";

export default function ParticipantAgreementsPage() {
  return <LivingShell><AgreementList surface="participant" /></LivingShell>;
}
