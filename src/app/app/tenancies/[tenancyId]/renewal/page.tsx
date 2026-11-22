import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { tenancyRenewal } from "@/lib/validation/tenancy-renewal";
import { RenewalView } from "./renewal-view";

export default async function TenancyRenewalPage({ params }: { params: Promise<{ tenancyId: string }> }) {
  const id = z.uuid().safeParse((await params).tenancyId);
  if (!id.success) notFound();
  const context = await getOrganizationContext();
  if (context.state !== "active") return <div className="max-w-2xl space-y-4">
    <h1 className="text-3xl font-semibold tracking-tight">Tenancy renewal</h1>
    <p className="text-muted-foreground">Open the tenancy’s workspace to view its renewal terms.</p>
    <Button asChild variant="outline"><Link href="/app/properties">View properties</Link></Button>
  </div>;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_tenancy_renewal", {
    p_organization_id: context.active.organizationId, p_tenancy_id: id.data,
  });
  if (error?.code === "P0002" || error?.code === "42501") notFound();
  const renewal = tenancyRenewal.safeParse(data);
  if (error || !renewal.success || renewal.data.tenancyId !== id.data) return <div className="max-w-2xl space-y-4">
    <h1 className="text-3xl font-semibold tracking-tight">Tenancy renewal</h1>
    <p role="alert" className="text-muted-foreground">The renewal record is temporarily unavailable.</p>
    <Button asChild variant="outline"><Link href={`/app/tenancies/${id.data}/closeout`}>Return to tenancy</Link></Button>
  </div>;
  return <RenewalView key={id.data} record={renewal.data} organizationId={context.active.organizationId} />;
}
