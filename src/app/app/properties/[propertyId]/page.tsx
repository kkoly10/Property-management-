import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, CircleAlert, DoorOpen, MapPin } from "lucide-react";
import { UnitForm } from "@/app/app/properties/unit-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPropertyWorkspace } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

export default async function PropertyWorkspacePage({ params, searchParams }: { params: Promise<{ propertyId: string }>; searchParams: Promise<{ unit_created?: string }> }) {
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  const workspace = await getPropertyWorkspace(propertyId);
  if (workspace.mode === "ready" && !workspace.property) notFound();
  if (!workspace.property) return <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Property unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert>;
  const property = workspace.property;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Button asChild variant="ghost"><Link href="/app/properties"><ArrowLeft className="h-4 w-4" />Back to properties</Link></Button>
      {workspace.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Property preview</AlertTitle><AlertDescription>This safe sample shows the final workspace until Supabase is connected.</AlertDescription></Alert> : null}
      {query.unit_created ? <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Unit added</AlertTitle><AlertDescription>The active-unit usage meter and audit timeline were updated in the same transaction.</AlertDescription></Alert> : null}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Building2 className="h-5 w-5" /></span><div><div className="flex items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.035em]">{property.name}</h1><Badge variant={property.status === "active" ? "success" : "neutral"}>{property.status}</Badge></div><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{property.addressLine1}, {[property.locality,property.subdivisionCode,property.postalCode].filter(Boolean).join(", ")}</p></div></div></div><div className="flex gap-3"><div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Book currency</p><p className="mt-1 font-mono font-semibold">{property.currencyCode}</p></div><div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Active units</p><p className="mt-1 font-mono font-semibold">{property.unitCount}</p></div></div></div>
      <nav aria-label="Property workspace" className="flex gap-1 overflow-x-auto border-b"><a href="#overview" className="border-b-2 border-primary px-3 py-3 text-sm font-semibold text-primary">Overview</a><a href="#units" className="px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">Units</a></nav>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6"><Card id="overview"><CardHeader><CardTitle>Property foundation</CardTitle><CardDescription>The accounting and jurisdiction anchors that downstream leases, payments, and reports inherit.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg bg-muted/50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting book</p><p className="mt-2 font-medium">{property.bookName}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{property.currencyCode}</p></div><div className="rounded-lg bg-muted/50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jurisdiction</p><p className="mt-2 font-medium">{property.countryCode}{property.subdivisionCode ? ` · ${property.subdivisionCode}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{property.timeZone}</p></div></CardContent></Card>
        <Card id="units"><CardHeader className="border-b"><CardTitle>Units</CardTitle><CardDescription>Active operational units count toward the organization&apos;s plan allowance.</CardDescription></CardHeader><CardContent className="divide-y p-0">{workspace.units.length ? workspace.units.map((unit) => <div key={unit.id} className="flex items-center gap-4 px-6 py-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><DoorOpen className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="font-semibold">Unit {unit.unitCode}</p><p className="mt-1 text-sm text-muted-foreground">{[unit.unitType,unit.bedrooms !== null ? `${unit.bedrooms} bd` : null,unit.bathrooms !== null ? `${unit.bathrooms} ba` : null,unit.squareFeet !== null ? `${unit.squareFeet.toLocaleString()} sq ft` : null].filter(Boolean).join(" · ") || "Details not added"}</p></div><Badge variant={unit.status === "active" ? "success" : "neutral"}>{unit.status}</Badge></div>) : <div className="px-6 py-10 text-center"><p className="font-semibold">No units yet</p><p className="mt-2 text-sm text-muted-foreground">Add the first operational unit using the form.</p></div>}</CardContent></Card></div>
        <Card className="h-fit"><CardHeader className="border-b"><CardTitle>Add a unit</CardTitle><CardDescription>Creation is plan-checked, idempotent, audited, and property-scoped.</CardDescription></CardHeader><CardContent className="pt-6"><UnitForm organizationId={property.organizationId} propertyId={property.id} /></CardContent></Card>
      </div>
    </div>
  );
}
