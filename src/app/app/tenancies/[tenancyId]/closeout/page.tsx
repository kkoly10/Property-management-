import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { tenancyCloseout } from "@/lib/validation/tenancy-closeout";
import { tenancyDeposit } from "@/lib/validation/tenancy-deposit";
import { DepositRegister } from "./deposit-register";
import { TenancyCloseoutView } from "./tenancy-closeout-view";

export default async function TenancyCloseoutPage({ params }: { params: Promise<{ tenancyId: string }> }) {
  const tenancyId = z.uuid().safeParse((await params).tenancyId);
  if (!tenancyId.success) notFound();
  const context = await getOrganizationContext();

  if (context.state !== "active") {
    return <section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Tenancy closeout</h1>
      <p className="text-muted-foreground">
        {context.state === "setup"
          ? "An authorized operator can plan a handback, record returned possession, and review the tenancy’s ledger here."
          : "Open the workspace for this tenancy to view its closeout."}
      </p>
      <Button asChild variant="outline"><Link href="/app/properties">View properties</Link></Button>
    </section>;
  }

  const supabase = await createClient();
  const rpcScope = {
    p_organization_id: context.active.organizationId,
    p_tenancy_id: tenancyId.data,
  };
  const [{ data, error }, deposit] = await Promise.all([
    supabase.rpc("get_tenancy_closeout", rpcScope),
    supabase.rpc("get_tenancy_deposit", rpcScope),
  ]);
  if (error?.code === "P0002" || error?.code === "42501") notFound();

  const closeout = tenancyCloseout.safeParse(data);
  if (error || !closeout.success || closeout.data.tenancyId !== tenancyId.data) {
    return <section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Tenancy closeout</h1>
      <p role="alert" className="text-muted-foreground">The tenancy is temporarily unavailable. Refresh and try again.</p>
      <Button asChild variant="outline"><Link href="/app/properties">View properties</Link></Button>
    </section>;
  }

  const register = tenancyDeposit.safeParse(deposit.data);
  return <div className="max-w-3xl space-y-6">
    <Button asChild variant="outline"><Link href={`/app/tenancies/${tenancyId.data}/move-in`}>Move-in handover</Link></Button>
    <TenancyCloseoutView key={closeout.data.tenancyId} closeout={closeout.data}
      organizationId={context.active.organizationId} />
    {!deposit.error && register.success && register.data.tenancyId === closeout.data.tenancyId
      ? <DepositRegister key={register.data.tenancyId} register={register.data} organizationId={context.active.organizationId}
        property={{ id: closeout.data.propertyId, name: closeout.data.propertyName }} />
      : deposit.error?.code !== "P0002" && deposit.error?.code !== "42501" && closeout.data.accounting
        ? <p role="status" className="text-sm text-muted-foreground">The security deposit register is temporarily unavailable.</p>
        : null}
  </div>;
}
