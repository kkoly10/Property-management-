import { CircleAlert, Mail, Phone, ShieldCheck, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorVendorDirectory } from "@/lib/data/maintenance";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { CreateVendorForm } from "./create-vendor-form";

export const dynamic = "force-dynamic";

/**
 * The operator vendor directory.
 *
 * The directory RPC and the create command already existed; what did not was any way to reach them
 * outside a single maintenance request. Adding a vendor required already being inside a work order,
 * so the first vendor of a new organization could only be created by someone with database access —
 * which is exactly the kind of gap that makes a journey look built from the inside and impossible
 * from the outside.
 */
export default async function OperatorVendorsPage() {
  const organizationId = await getActiveOrganizationId();
  const directory = await getOperatorVendorDirectory(organizationId);
  const disabled = directory.mode !== "ready" || !organizationId;

  return <div className="space-y-6">
    <div>
      <p className="text-sm text-muted-foreground">Operations</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Vendors</h1>
      <p className="mt-2 text-sm text-muted-foreground">The contractors your organization assigns to work orders.</p>
    </div>

    {directory.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Vendor preview</AlertTitle><AlertDescription>This sample shows the vendor directory until Supabase is connected.</AlertDescription></Alert> : null}
    {directory.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Vendors unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {directory.requestId}.</AlertDescription></Alert> : null}

    <CreateVendorForm organizationId={organizationId} disabled={disabled} />

    <Card>
      <CardHeader>
        <CardTitle>Vendor directory</CardTitle>
        <CardDescription>{directory.vendors.length} {directory.vendors.length === 1 ? "vendor" : "vendors"} available for assignment.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {directory.vendors.length
          ? <ul className="divide-y">
              {directory.vendors.map((vendor) => <li key={vendor.vendorId} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{vendor.displayName}</h2>
                    <Badge variant={vendor.status === "active" ? "success" : "neutral"}>{vendor.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    {vendor.email ? <span className="flex items-center gap-1.5"><Mail aria-hidden="true" className="h-3.5 w-3.5" />{vendor.email}</span> : null}
                    {vendor.phoneE164 ? <span className="flex items-center gap-1.5"><Phone aria-hidden="true" className="h-3.5 w-3.5" /><span className="font-mono">{vendor.phoneE164}</span></span> : null}
                    {!vendor.email && !vendor.phoneE164 ? <span>No contact details recorded.</span> : null}
                  </div>
                </div>
              </li>)}
            </ul>
          : <div className="px-5 py-12 text-center">
              <Wrench aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No vendors yet. Add one above before assigning a work order.</p>
            </div>}
      </CardContent>
    </Card>
  </div>;
}
