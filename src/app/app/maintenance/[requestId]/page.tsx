import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, CircleAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorVendorDirectory, getOperatorWorkOrderDetail } from "@/lib/data/maintenance";
import { AssignVendorForm } from "./assign-vendor-form";
import { WorkOrderActions } from "./work-order-actions";

export const dynamic = "force-dynamic";
const label = (value: string) => value.replaceAll("_", " ");
const money = (amountMinor: number, currencyCode: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amountMinor / 100);

export default async function OperatorMaintenanceDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const [detail, directory] = await Promise.all([getOperatorWorkOrderDetail(requestId), getOperatorVendorDirectory()]);
  if (detail.mode === "ready" && !detail.item) notFound();
  const item = detail.item;

  return <div className="mx-auto max-w-5xl space-y-6">
    <Button asChild variant="ghost" size="sm"><Link href="/app/maintenance"><ArrowLeft className="h-4 w-4" />Maintenance</Link></Button>
    {detail.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Work order preview</AlertTitle><AlertDescription>This sample shows the assignment and status controls until Supabase is connected.</AlertDescription></Alert> : null}
    {detail.mode === "error" || !item ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Maintenance request unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription></Alert> : <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">{item.publicReference}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{item.title}</h1><p className="mt-2 text-sm text-muted-foreground">{item.propertyName} · Unit {item.unitCode} · {label(item.category)}</p></div>
        <div className="flex flex-wrap gap-2"><Badge variant={item.status === "new" ? "warning" : "info"}>{label(item.status)}</Badge><Badge variant="neutral">Official priority: {label(item.officialPriority)}</Badge></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <div className="space-y-6">
          <Card><CardHeader className="border-b"><CardTitle>Resident report</CardTitle></CardHeader><CardContent className="space-y-3 p-5 text-sm"><p className="leading-6">{item.description}</p><p className="text-xs text-muted-foreground">Requested priority: {item.priorityRequested ? label(item.priorityRequested) : "not set"} · {item.accessPermission ?? "No access instructions"}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" />{item.evidenceCount} resident photos</p></CardContent></Card>
          {item.workOrder ? <Card><CardHeader className="border-b"><CardTitle>Work order {item.workOrder.publicReference}</CardTitle><CardDescription>{item.workOrder.vendorName ? `Assigned to ${item.workOrder.vendorName}` : "No vendor assigned"}</CardDescription></CardHeader><CardContent className="space-y-3 p-5 text-sm">
            <p><span className="text-muted-foreground">Scope:</span> {item.workOrder.scope}</p>
            {item.workOrder.scheduledStart ? <p><span className="text-muted-foreground">Scheduled:</span> {new Date(item.workOrder.scheduledStart).toLocaleString()} – {item.workOrder.scheduledEnd ? new Date(item.workOrder.scheduledEnd).toLocaleString() : "?"}</p> : null}
            {item.workOrder.estimatedCostMinor !== null && item.workOrder.currencyCode ? <p><span className="text-muted-foreground">Estimated cost:</span> {money(item.workOrder.estimatedCostMinor, item.workOrder.currencyCode)}</p> : null}
            {item.workOrder.actualCostMinor !== null && item.workOrder.currencyCode ? <p><span className="text-muted-foreground">Actual cost:</span> {money(item.workOrder.actualCostMinor, item.workOrder.currencyCode)}</p> : null}
            {item.workOrder.completionSummary ? <p><span className="text-muted-foreground">Completion notes:</span> {item.workOrder.completionSummary}</p> : null}
            {item.workOrder.canceledReason ? <p><span className="text-muted-foreground">Canceled:</span> {item.workOrder.canceledReason}</p> : null}
            {item.workOrder.ownerApprovalRequired ? <Badge variant={item.workOrder.ownerApprovalStatus === "approved" ? "success" : "warning"}>Owner approval {item.workOrder.ownerApprovalStatus ?? "pending"}</Badge> : null}
          </CardContent></Card> : null}
        </div>
        <aside>{item.workOrder ? <WorkOrderActions key={`${item.workOrder.workOrderId}:${item.workOrder.version}`} workOrderId={item.workOrder.workOrderId} organizationId={item.organizationId} status={item.workOrder.status} version={item.workOrder.version} disabled={detail.mode !== "ready"} /> : <AssignVendorForm maintenanceRequestId={item.maintenanceRequestId} organizationId={item.organizationId} vendors={directory.vendors} disabled={detail.mode !== "ready"} />}</aside>
      </div>
    </>}
  </div>;
}
