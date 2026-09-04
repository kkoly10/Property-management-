import Link from "next/link";
import { Building2, ChevronRight, CircleAlert, Landmark, Mail, Phone, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorOwnerDirectory } from "@/lib/data/owners";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { CreateOwnerForm } from "./create-owner-form";

export const dynamic = "force-dynamic";

export default async function OperatorOwnersPage() {
  const organizationId = await getActiveOrganizationId();
  const directory = await getOperatorOwnerDirectory(organizationId);
  const disabled = directory.mode !== "ready" || !organizationId;

  return <div className="space-y-6">
    <div><p className="text-sm text-muted-foreground">Operations</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Owners</h1><p className="mt-2 text-sm text-muted-foreground">The people and entities that own the properties you manage, and their statements and approvals.</p></div>
    {directory.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Owner preview</AlertTitle><AlertDescription>This sample shows the owner directory until Supabase is connected.</AlertDescription></Alert> : null}
    {directory.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Owners unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {directory.requestId}.</AlertDescription></Alert> : null}
    <CreateOwnerForm organizationId={organizationId} disabled={disabled} />
    <Card>
      <CardHeader><CardTitle>Owner directory</CardTitle><CardDescription>{directory.owners.length} {directory.owners.length === 1 ? "owner" : "owners"}.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {directory.owners.length ? <ul className="divide-y">
          {directory.owners.map((owner) => <li key={owner.ownerEntityId}>
            <Link href={`/app/owners/${owner.ownerEntityId}`} className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-muted/40">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{owner.displayName}</h2><Badge variant="neutral">{owner.entityType}</Badge>{owner.status !== "active" ? <Badge variant="warning">{owner.status}</Badge> : null}</div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Building2 aria-hidden="true" className="h-3.5 w-3.5" />{owner.propertyCount} {owner.propertyCount === 1 ? "property" : "properties"}</span>
                  {owner.email ? <span className="flex items-center gap-1.5"><Mail aria-hidden="true" className="h-3.5 w-3.5" />{owner.email}</span> : null}
                  {owner.phoneE164 ? <span className="flex items-center gap-1.5"><Phone aria-hidden="true" className="h-3.5 w-3.5" /><span className="font-mono">{owner.phoneE164}</span></span> : null}
                </div>
              </div>
              <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>)}
        </ul> : <div className="px-5 py-12 text-center"><Landmark aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">No owners yet. Add one above, then record the property they hold.</p></div>}
      </CardContent>
    </Card>
  </div>;
}
