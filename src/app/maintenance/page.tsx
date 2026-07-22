import Link from "next/link";
import { ArrowRight, Camera, CircleAlert, Clock3, Plus, ShieldCheck, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getResidentMaintenanceWorkspace } from "@/lib/data/maintenance";

export const dynamic = "force-dynamic";
const statusLabel: Record<string, string> = { submitted: "Submitted", reviewed: "Reviewed", scheduled: "Scheduled", being_repaired: "Being repaired", waiting_for_confirmation: "Waiting for confirmation", completed: "Completed", canceled: "Canceled" };

export default async function ResidentMaintenancePage() {
  const workspace = await getResidentMaintenanceWorkspace();
  const open = workspace.items.filter((item) => !["completed", "canceled"].includes(item.residentVisibleStatus)).length;
  return <div className="min-h-screen bg-[#f6f8fb] pb-24">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Living</Badge></div></header>
    <main className="mx-auto max-w-5xl space-y-6 p-5 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">Resident maintenance</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Requests</h1><p className="mt-2 text-sm text-muted-foreground">{open} open {open === 1 ? "request" : "requests"}</p></div><Button asChild><Link href="/maintenance/new"><Plus className="h-4 w-4" />Report an issue</Link></Button></div>
      {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Maintenance preview</AlertTitle><AlertDescription>This sample shows how requests will appear when Supabase is connected.</AlertDescription></Alert> : null}
      {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Requests unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
      {workspace.items.length ? <div className="grid gap-4">{workspace.items.map((item) => <Card key={item.maintenanceRequestId}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={item.residentVisibleStatus === "completed" ? "success" : "info"}>{statusLabel[item.residentVisibleStatus] ?? item.residentVisibleStatus}</Badge><span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span></div><h2 className="mt-3 font-semibold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.propertyName} · Unit {item.unitCode} · {item.category.replaceAll("_", " ")}</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{new Date(item.createdAt).toLocaleDateString()}</span><span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{item.evidenceCount} photos</span></div></div><Button asChild size="sm" variant="outline"><Link href={`/maintenance/${item.maintenanceRequestId}`}>View <ArrowRight className="h-4 w-4" /></Link></Button></CardContent></Card>)}</div> : <Card><CardContent className="flex flex-col items-center px-5 py-12 text-center"><Wrench className="h-8 w-8 text-muted-foreground" /><CardTitle className="mt-4">No maintenance requests</CardTitle><CardDescription className="mt-2">When something needs attention, report it here.</CardDescription><Button asChild className="mt-5"><Link href="/maintenance/new">Report an issue</Link></Button></CardContent></Card>}
    </main>
    <nav aria-label="Resident" className="fixed inset-x-0 bottom-0 border-t bg-white/95 px-4 py-3 backdrop-blur sm:hidden"><div className="mx-auto flex max-w-md items-center justify-around text-xs font-medium"><Link className="text-muted-foreground" href="/home">Home</Link><Link className="text-muted-foreground" href="/payments/new">Payments</Link><Link className="text-primary" href="/maintenance">Maintenance</Link><span className="text-muted-foreground">More</span></div></nav>
  </div>;
}
