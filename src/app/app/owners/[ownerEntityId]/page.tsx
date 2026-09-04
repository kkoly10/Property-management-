import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CircleAlert, Mail, Phone, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorOwnerDetail } from "@/lib/data/owners";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { AddInterestForm } from "./add-interest-form";

export const dynamic = "force-dynamic";

export default async function OperatorOwnerDetailPage({ params }: { params: Promise<{ ownerEntityId: string }> }) {
  const { ownerEntityId } = await params;
  const organizationId = await getActiveOrganizationId();
  const detail = await getOperatorOwnerDetail(organizationId, ownerEntityId);
  if (detail.mode === "ready" && !detail.owner) notFound();
  const owner = detail.owner;
  const disabled = detail.mode !== "ready" || !organizationId;

  // What percent of each property is already allocated across all owners is not known from one owner's
  // interests alone, so the form reflects only this owner's own share per property as a helpful hint.
  const allocatedByProperty: Record<string, number> = {};
  for (const interest of detail.interests) allocatedByProperty[interest.propertyId] = (allocatedByProperty[interest.propertyId] ?? 0) + interest.ownershipFraction;

  return <div className="space-y-6">
    <div><Link href="/app/owners" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="h-4 w-4" />All owners</Link></div>
    {detail.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Owner preview</AlertTitle><AlertDescription>This sample shows an owner until Supabase is connected.</AlertDescription></Alert> : null}
    {detail.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Owner unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription></Alert> : null}
    {owner ? <>
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.035em]">{owner.displayName}</h1><Badge variant="neutral">{owner.entityType}</Badge>{owner.status !== "active" ? <Badge variant="warning">{owner.status}</Badge> : null}</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">{owner.email ? <span className="flex items-center gap-1.5"><Mail aria-hidden="true" className="h-3.5 w-3.5" />{owner.email}</span> : null}{owner.phoneE164 ? <span className="flex items-center gap-1.5"><Phone aria-hidden="true" className="h-3.5 w-3.5" /><span className="font-mono">{owner.phoneE164}</span></span> : null}</div>
      </div>
      <Card>
        <CardHeader><CardTitle>Property holdings</CardTitle><CardDescription>The properties this owner holds a share of, and the effective period.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {detail.interests.length ? <ul className="divide-y">{detail.interests.map((interest) => <li key={interest.ownershipInterestId} className="flex items-center justify-between gap-3 p-5">
            <div className="min-w-0"><div className="flex items-center gap-2"><Building2 aria-hidden="true" className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">{interest.propertyName}</h2></div><p className="mt-1 text-sm text-muted-foreground">{interest.effectiveFrom} → {interest.effectiveTo ?? "ongoing"}</p></div>
            <span className="font-mono text-lg font-semibold">{(interest.ownershipFraction * 100).toFixed(interest.ownershipFraction * 100 % 1 === 0 ? 0 : 2)}%</span>
          </li>)}</ul> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No property interests recorded yet.</p>}
        </CardContent>
      </Card>
      <AddInterestForm organizationId={organizationId} ownerEntityId={ownerEntityId} properties={detail.properties} allocatedByProperty={allocatedByProperty} disabled={disabled} />
    </> : null}
  </div>;
}
