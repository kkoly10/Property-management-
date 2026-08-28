import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getOperatorOwnerStatementWorkspace } from "@/lib/data/owner-statements";
import { OwnerStatementPreparation } from "./owner-statement-preparation";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

function previousMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function OwnerStatementPreparationPage({
  params,
  searchParams,
}: {
  params: Promise<{ ownerEntityId: string }>;
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const organizationId = await getActiveOrganizationId();
  const [{ ownerEntityId }, { propertyId }] = await Promise.all([params, searchParams]);
  const workspace = await getOperatorOwnerStatementWorkspace(organizationId);
  const owner = workspace.owners.find((item) => item.ownerEntityId === ownerEntityId && item.propertyId === propertyId);
  if (workspace.mode === "ready" && !owner) notFound();
  const period = previousMonth();

  return <div className="space-y-6">
    <Button asChild variant="ghost" size="sm"><Link href="/app/owner-statements"><ArrowLeft className="h-4 w-4" />Owner statements</Link></Button>
    {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Statement preview</AlertTitle><AlertDescription>Calculation and finalization are disabled until Supabase is connected.</AlertDescription></Alert> : null}
    {workspace.mode === "error" || !owner ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Statement preparation unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : <OwnerStatementPreparation owner={owner} defaultPeriodStart={period.start} defaultPeriodEnd={period.end} disabled={workspace.mode !== "ready"} />}
  </div>;
}
