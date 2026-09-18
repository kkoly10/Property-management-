import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Mail, Phone, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorVendorDetail } from "@/lib/data/maintenance";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { ManageVendorForm } from "./manage-vendor-form";

export const dynamic = "force-dynamic";

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Never";

/**
 * One vendor, and the controls to correct or retire them.
 *
 * The record is read out of the caller's own organization workspace rather than fetched by id, so an
 * id belonging to another organization has nothing to find and renders not-found — the same answer a
 * mistyped id gets, which is the answer it should get.
 */
export default async function OperatorVendorDetailPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const organizationId = await getActiveOrganizationId();
  const detail = await getOperatorVendorDetail(organizationId, vendorId);
  // Absent means absent, in preview as much as in production. Only a genuine read failure is worth
  // telling the operator to retry — an id that is not in their organization is simply not found.
  if (!detail.vendor && detail.mode !== "error") notFound();

  const vendor = detail.vendor;
  if (!vendor) {
    return <div className="space-y-6">
      <Link href="/app/vendors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Vendors</Link>
      <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Vendor unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription></Alert>
    </div>;
  }

  // Read access reaches further than write access here, so the controls follow the command's own
  // answer rather than the fact that the page rendered.
  const disabled = detail.mode !== "ready" || !organizationId || !vendor.canManage;

  return <div className="space-y-6">
    <div>
      <Link href="/app/vendors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Vendors</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">{vendor.displayName}</h1>
        <Badge variant={vendor.status === "active" ? "success" : "neutral"}>{vendor.status}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {vendor.email ? <span className="flex items-center gap-1.5"><Mail aria-hidden="true" className="h-3.5 w-3.5" />{vendor.email}</span> : null}
        {vendor.phoneE164 ? <span className="flex items-center gap-1.5"><Phone aria-hidden="true" className="h-3.5 w-3.5" /><span className="font-mono">{vendor.phoneE164}</span></span> : null}
        {!vendor.email && !vendor.phoneE164 ? <span>No contact details recorded.</span> : null}
      </div>
    </div>

    {detail.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Vendor preview</AlertTitle><AlertDescription>This sample record shows the management surface until Supabase is connected.</AlertDescription></Alert> : null}
    {!vendor.canManage && detail.mode === "ready" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Read-only</AlertTitle><AlertDescription>Changing the vendor directory needs organization-wide maintenance access.</AlertDescription></Alert> : null}

    <Card>
      <CardHeader><CardTitle>Assignment history</CardTitle><CardDescription>What this vendor is attached to today.</CardDescription></CardHeader>
      <CardContent>
        <dl className="grid gap-5 sm:grid-cols-3">
          <div><dt className="text-sm text-muted-foreground">Work orders</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{vendor.workOrderCount}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Still open</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{vendor.openWorkOrderCount}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Last assigned</dt><dd className="mt-1 text-sm font-medium">{dateLabel(vendor.lastAssignedAt)}</dd></div>
        </dl>
        {vendor.openWorkOrderCount > 0 && vendor.status === "active"
          ? <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">Making this vendor inactive or archived stops new assignments. The {vendor.openWorkOrderCount === 1 ? "work order" : "work orders"} already open {vendor.openWorkOrderCount === 1 ? "stays" : "stay"} with them.</p>
          : null}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Vendor details</CardTitle><CardDescription>Added {dateLabel(vendor.createdAt)}.</CardDescription></CardHeader>
      <CardContent><ManageVendorForm organizationId={organizationId} vendor={vendor} disabled={disabled} /></CardContent>
    </Card>
  </div>;
}
