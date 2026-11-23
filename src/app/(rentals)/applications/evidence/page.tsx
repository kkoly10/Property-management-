import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { applicationAccessToken } from "@/lib/rental-application-access";
import { rentalEvidenceEnabled } from "@/lib/rental-evidence/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { evidenceReferenceSchema } from "@/lib/validation/rental-evidence";
import { ApplicationEvidence } from "./application-evidence";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private application documents · Crecy", robots: { index: false, follow: false } };

export default async function ApplicationEvidencePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  if (!rentalEvidenceEnabled()) notFound();
  const reference = evidenceReferenceSchema.safeParse((await searchParams).ref);
  if (!reference.success) notFound();
  const returnTo = `/applications/evidence?ref=${encodeURIComponent(reference.data)}`;
  const status = `/applications?ref=${encodeURIComponent(reference.data)}`;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  let verifiedApplicationEmail: string | undefined;
  if (!auth.user) {
    const token = await applicationAccessToken(reference.data);
    if (!token) notFound();
    const admin = createAdminClient();
    const [availability, access] = await Promise.all([
      admin.rpc("rental_evidence_available_for_access", { p_access_token: token }),
      admin.rpc("get_public_rental_application_for_access", { p_access_token: token }),
    ]);
    if (availability.error || availability.data !== true || access.error || access.data?.applicationReference !== reference.data
      || typeof access.data?.email !== "string") notFound();
    verifiedApplicationEmail = access.data.email;
  }
  return <section className="mx-auto max-w-2xl space-y-6 px-5 py-10">
    <Link href={status} className="text-sm font-medium text-primary">Back to application status</Link>
    <h1 className="text-3xl font-semibold tracking-tight">Private application documents</h1>
    <ApplicationEvidence reference={reference.data} returnTo={returnTo} verifiedApplicationEmail={verifiedApplicationEmail} />
  </section>;
}
