import Link from "next/link";
import { CircleAlert, FileSignature, Mail, Phone, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getResidentDirectory } from "@/lib/data/leasing";

export const dynamic = "force-dynamic";

function formatMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amountMinor / 100);
}

export default async function ResidentsPage() {
  const directory = await getResidentDirectory();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">Resident operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Residents</h1><p className="mt-2 text-sm text-muted-foreground">Current household and tenancy relationships across your property scope.</p></div><Button asChild><Link href="/app/leases/record"><FileSignature className="h-4 w-4" />Record existing lease</Link></Button></div>
      {directory.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Directory preview</AlertTitle><AlertDescription>This safe sample shows the resident directory until Supabase is connected.</AlertDescription></Alert> : null}
      {directory.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Residents unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {directory.requestId}.</AlertDescription></Alert> : null}
      <Card><CardHeader className="border-b"><CardTitle>Active and scheduled households</CardTitle><CardDescription>Residents appear only through an authorized tenancy in your property scope.</CardDescription></CardHeader><CardContent className="p-0">
        {directory.residents.length ? <div className="divide-y">{directory.residents.map((resident) => <div key={resident.personId} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Users className="h-4 w-4" /></span><div><p className="font-semibold">{resident.name}</p><p className="mt-1 text-sm text-muted-foreground">{resident.householdName}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">{resident.email ? <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{resident.email}</span> : null}{resident.phoneE164 ? <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{resident.phoneE164}</span> : null}</div></div></div><div><p className="text-sm font-medium">{resident.propertyName}</p><p className="mt-1 text-xs text-muted-foreground">Unit {resident.unitCode}</p></div><div><p className="font-mono text-sm font-semibold">{formatMoney(resident.rentAmountMinor, resident.currencyCode)}</p><p className="mt-1 text-xs text-muted-foreground">{resident.leaseStart} → {resident.leaseEnd ?? "ongoing"}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><Badge variant={resident.tenancyStatus === "active" ? "success" : "neutral"}>{resident.tenancyStatus}</Badge><Badge variant={resident.invitationState === "active" ? "info" : "neutral"}>{resident.invitationState === "active" ? "Portal active" : "Not invited"}</Badge></div></div>)}</div> : <div className="px-6 py-14 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-4 font-semibold">No resident tenancies yet</p><p className="mt-2 text-sm text-muted-foreground">Record an existing signed lease to create the first household.</p><Button asChild className="mt-5" variant="outline"><Link href="/app/leases/record">Record lease</Link></Button></div>}
      </CardContent></Card>
    </div>
  );
}
