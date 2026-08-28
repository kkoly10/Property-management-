import Link from "next/link";
import { Camera, CircleAlert, ClockAlert, Inbox, ShieldCheck, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorMaintenanceWorkspace } from "@/lib/data/maintenance";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

export default async function OperatorMaintenancePage() {
  const organizationId = await getActiveOrganizationId();
  const workspace = await getOperatorMaintenanceWorkspace(organizationId);
  const summaries = [{ label: "Open requests", value: workspace.summary.open, icon: Wrench }, { label: "Needs triage", value: workspace.summary.untriaged, icon: Inbox }, { label: "Overdue", value: workspace.summary.overdue, icon: ClockAlert }];
  return <div className="space-y-6"><div><p className="text-sm text-muted-foreground">Operations</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Maintenance</h1><p className="mt-2 text-sm text-muted-foreground">Review resident issues and keep the official triage state separate from requested urgency.</p></div>
    {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Maintenance preview</AlertTitle><AlertDescription>This sample shows the operator intake queue until Supabase is connected.</AlertDescription></Alert> : null}
    {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Maintenance unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
    <section aria-label="Maintenance summary" className="grid gap-4 sm:grid-cols-3">{summaries.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="mt-3 font-mono text-3xl font-semibold">{value}</p></CardContent></Card>)}</section>
    <Card><CardHeader><CardTitle>Intake queue</CardTitle><CardDescription>Newest resident reports first. Open a request to assign a vendor and track the work order.</CardDescription></CardHeader><CardContent className="p-0">{workspace.items.length ? <div className="divide-y">{workspace.items.map((item) => <Link key={item.maintenanceRequestId} href={`/app/maintenance/${item.maintenanceRequestId}`} className="block p-5 transition-colors hover:bg-muted/40"><article><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === "new" ? "warning" : "info"}>{item.status.replaceAll("_", " ")}</Badge><span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span>{item.workOrder ? <Badge variant="neutral">{item.workOrder.vendorName ? `Assigned · ${item.workOrder.vendorName}` : "Work order open"}</Badge> : null}</div><h2 className="mt-3 font-semibold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.propertyName} · Unit {item.unitCode} · {item.category.replaceAll("_", " ")}</p><p className="mt-3 max-w-3xl text-sm leading-6">{item.description}</p></div><div className="shrink-0 rounded-lg border bg-muted/50 p-3 text-sm"><p><span className="text-muted-foreground">Requested:</span> {item.priorityRequested ?? "not set"}</p><p className="mt-1"><span className="text-muted-foreground">Official:</span> {item.officialPriority}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" />{item.evidenceCount} photos · {new Date(item.createdAt).toLocaleDateString()}</p></div></div></article></Link>)}</div> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No maintenance requests are waiting.</p>}</CardContent></Card>
  </div>;
}
