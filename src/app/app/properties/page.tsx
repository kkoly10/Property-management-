import Link from "next/link";
import { ArrowRight, Building2, CircleAlert, Plus, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPortfolioState } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const portfolio = await getPortfolioState();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">Portfolio</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Properties</h1><p className="mt-2 text-sm text-muted-foreground">Properties stay attached to one accounting book and functional currency.</p></div><div className="flex gap-2"><Button variant="outline" disabled><Upload className="h-4 w-4" />Import</Button><Button asChild><Link href="/onboarding/property"><Plus className="h-4 w-4" />Add property</Link></Button></div></div>
      {portfolio.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Portfolio preview</AlertTitle><AlertDescription>Connect Supabase and apply both migrations to load tenant-scoped portfolio data.</AlertDescription></Alert> : null}
      {portfolio.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Portfolio unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {portfolio.requestId}.</AlertDescription></Alert> : null}
      {!portfolio.properties.length ? (
        <Card><CardContent className="flex flex-col items-center px-6 py-16 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Building2 className="h-6 w-6" /></span><h2 className="mt-5 text-lg font-semibold">Add your first property</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Create a property manually now. Bulk import arrives in the next portfolio slice after validation staging is in place.</p><Button asChild className="mt-6"><Link href="/onboarding/property">Create property</Link></Button></CardContent></Card>
      ) : (
        <Card className="overflow-hidden"><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-semibold">Property</th><th className="px-5 py-3 font-semibold">Location</th><th className="px-5 py-3 font-semibold">Book</th><th className="px-5 py-3 font-semibold">Units</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3"><span className="sr-only">Open</span></th></tr></thead><tbody className="divide-y">{portfolio.properties.map((property) => <tr key={property.id} className="hover:bg-muted/40"><td className="px-5 py-4 font-semibold">{property.name}</td><td className="px-5 py-4 text-muted-foreground">{[property.locality,property.subdivisionCode,property.countryCode].filter(Boolean).join(", ")}</td><td className="px-5 py-4"><span className="block">{property.bookName}</span><span className="font-mono text-xs text-muted-foreground">{property.currencyCode}</span></td><td className="px-5 py-4 font-mono">{property.unitCount}</td><td className="px-5 py-4"><Badge variant={property.status === "active" ? "success" : "neutral"}>{property.status}</Badge></td><td className="px-5 py-4 text-right"><Button asChild variant="ghost" size="icon"><Link href={`/app/properties/${property.id}`} aria-label={`Open ${property.name}`}><ArrowRight className="h-4 w-4" /></Link></Button></td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{portfolio.properties.map((property) => <Link key={property.id} href={`/app/properties/${property.id}`} className="flex items-start gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Building2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{property.name}</span><span className="mt-1 block text-sm text-muted-foreground">{property.unitCount} units · {property.currencyCode}</span></span><ArrowRight className="mt-2 h-4 w-4 text-muted-foreground" /></Link>)}</div></Card>
      )}
    </div>
  );
}
