import { notFound } from "next/navigation";
import { z } from "zod";
import { AgreementClaim } from "@/components/agreements/agreement-claim";
import { LivingShell } from "@/components/living/living-shell";

export const dynamic = "force-dynamic";

export default async function ClaimSigningAccessPage({ params }: { params: Promise<{ agreementId: string }> }) {
  const id = z.uuid().safeParse((await params).agreementId);
  if (!id.success) notFound();
  return <LivingShell><AgreementClaim agreementId={id.data} /></LivingShell>;
}
