import Link from "next/link";
import { ArrowRight, CircleAlert, Download, FileCheck2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorOwnerStatementWorkspace } from "@/lib/data/owner-statements";
import { InviteOwnerButton } from "./invite-owner-button";

export const dynamic = "force-dynamic";

const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

export default async function OwnerStatementsPage() {
  const workspace = await getOperatorOwnerStatementWorkspace();
  // An owner entity can span multiple properties (one row each); portal invitation is per owner
  // entity, so render the invite control only on the owner's first row.
  const firstRowKeyForOwner = new Map<string, string>();
  workspace.owners.forEach((owner) => {
    if (!firstRowKeyForOwner.has(owner.ownerEntityId)) firstRowKeyForOwner.set(owner.ownerEntityId, `${owner.ownerEntityId}:${owner.propertyId}`);
  });
  return <div className="space-y-6">
    <div><p className="text-sm text-muted-foreground">Owner accounting</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Owner statements</h1><p className="mt-2 text-sm text-muted-foreground">Calculate from posted ledger entries, review the owner allocation, and create an immutable snapshot.</p></div>
    {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Statement preview</AlertTitle><AlertDescription>This sample stays read-only until Supabase is connected.</AlertDescription></Alert> : null}
    {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Owner statements unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>Statement preparation</CardTitle><CardDescription>Only properties where you have both owner and finance management access appear here.</CardDescription></CardHeader>
      <CardContent className="p-0">{workspace.owners.length ? <div className="divide-y">{workspace.owners.map((owner) => <article key={`${owner.ownerEntityId}:${owner.propertyId}`} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="info">{owner.currencyCode}</Badge><span className="text-xs text-muted-foreground">Interest effective {new Date(`${owner.effectiveFrom}T00:00:00`).toLocaleDateString()}{owner.effectiveTo ? ` – ${new Date(`${owner.effectiveTo}T00:00:00`).toLocaleDateString()}` : ""}</span></div><h2 className="mt-2 font-semibold">{owner.ownerName}</h2><p className="mt-1 text-sm text-muted-foreground">{owner.propertyName}</p>{owner.latestStatement ? <p className="mt-3 flex items-center gap-2 text-sm"><FileCheck2 className="h-4 w-4 text-emerald-600" /><span>Latest: {new Date(`${owner.latestStatement.periodStart}T00:00:00`).toLocaleDateString()} – {new Date(`${owner.latestStatement.periodEnd}T00:00:00`).toLocaleDateString()} · v{owner.latestStatement.versionNumber} · <span className="font-medium">{money(owner.latestStatement.netOwnerPositionMinor, owner.currencyCode)}</span></span></p> : <p className="mt-3 text-sm text-muted-foreground">No finalized statements yet.</p>}<p className="mt-2 text-sm text-muted-foreground">Owner payable <span className="font-mono font-semibold text-foreground">{money(owner.ownerPayableMinor, owner.currencyCode)}</span>{owner.latestStatement ? <> · available on latest statement <span className="font-mono font-semibold text-foreground">{money(owner.latestStatement.availableToRemitMinor, owner.currencyCode)}</span></> : null}</p></div><div className="flex flex-col items-end gap-2">{firstRowKeyForOwner.get(owner.ownerEntityId) === `${owner.ownerEntityId}:${owner.propertyId}` ? <InviteOwnerButton ownerEntityId={owner.ownerEntityId} organizationId={owner.organizationId} email={owner.email} invitationState={owner.invitationState} disabled={workspace.mode !== "ready"} /> : null}<div className="flex gap-2">{owner.latestStatement ? <Button asChild size="sm" variant="ghost"><a href={`/api/v1/owner-statements/${owner.latestStatement.statementSnapshotId}/export`}><Download className="h-4 w-4" />CSV</a></Button> : null}<Button asChild size="sm" variant="outline"><Link href={`/app/owner-statements/${owner.ownerEntityId}?propertyId=${owner.propertyId}`}>Manage statement <ArrowRight className="h-4 w-4" /></Link></Button></div></div></article>)}</div> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No owner/property relationships are ready for statement preparation.</p>}</CardContent>
    </Card>
  </div>;
}
