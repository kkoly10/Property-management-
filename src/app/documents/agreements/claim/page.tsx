import { AgreementClaim } from "@/components/agreements/agreement-claim";
import { LivingShell } from "@/components/living/living-shell";

export const dynamic = "force-dynamic";

export default function SigningInvitationPage() {
  return <LivingShell><AgreementClaim /></LivingShell>;
}
