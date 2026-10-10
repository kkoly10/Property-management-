import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";
import { getResidentDirectory } from "@/lib/data/leasing";
import { leaseSetupStateSchema, type LeaseSetupState } from "@/lib/homeowner/lease-state";
import { LeaseSetupForm } from "./lease-setup-form";
import { LeaseSetupComplete } from "@/components/app/lease-setup-complete";
export const dynamic = "force-dynamic";
export default async function HomeownerLeaseSetupPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const workspace = await getRentalWorkspace();
  if (workspace.mode === "unavailable") redirect("/app");
  if (workspace.mode === "error") return <p role="alert">Your rental setup is unavailable. Please try again.</p>;
  const preview = workspace.mode === "setup" && unitId === "80000000-0000-4000-8000-000000000008";
  const unit = workspace.units.find(row => row.id === unitId);
  if (!preview && !unit) notFound();
  const organizationId = workspace.organization?.organizationId ?? "20000000-0000-4000-8000-000000000002";
  let initial: LeaseSetupState;
  if (preview) initial = { setupId: null, revision: 0, draft: null, result: null, status: "draft", documents: [], currency: "USD",
    localDate: new Date().toISOString().slice(0, 10), propertyId: "10000000-0000-4000-8000-000000000001" };
  else {
    const client = await createClient();
    const { data, error } = await client.rpc("get_homeowner_lease_setup", { p_organization_id: organizationId, p_unit_id: unitId });
    const parsed = leaseSetupStateSchema.safeParse(data);
    if (error || !parsed.success) return <p role="alert">This saved setup cannot be loaded. Check your workspace and lease/document access, then try again.</p>;
    initial = parsed.data;
  }
  const residents = initial.result ? await getResidentDirectory(organizationId) : null;
  return <div className="mx-auto max-w-4xl space-y-7">
    <Link href={`/app/rentals/${unitId}`} className="text-sm font-medium text-primary">Back to my rental</Link>
    {initial.result ? <LeaseSetupComplete result={initial.result} organizationId={organizationId} unitId={unitId} residents={residents?.residents} /> : <>
      <header><h1 className="text-3xl font-semibold tracking-tight">Add your existing signed rental</h1>
        <p className="mt-3 text-muted-foreground">{unit?.unit_code ?? "Sample basement"} · {initial.currency}. Save a draft to continue from another device.</p></header>
      {preview && <p className="rounded-lg border p-4 text-sm">Preview only. Connect and sign in to your rental workspace to save, upload or activate.</p>}
      <LeaseSetupForm organizationId={organizationId} unitId={unitId} initial={initial} disabled={preview} />
    </>}
  </div>;
}
