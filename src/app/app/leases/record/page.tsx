import Link from "next/link";
import { ArrowLeft, CircleAlert, FileSignature } from "lucide-react";
import { ExistingLeaseForm } from "@/app/app/leases/record/existing-lease-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getExistingLeaseOptions } from "@/lib/data/leasing";

export const dynamic = "force-dynamic";

export default async function RecordExistingLeasePage({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const [options, query] = await Promise.all([getExistingLeaseOptions(), searchParams]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost"><Link href="/app/residents"><ArrowLeft className="h-4 w-4" />Back to residents</Link></Button>
      <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><FileSignature className="h-6 w-6" /></span><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">Existing lease</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Activate a resident tenancy</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Record the signed agreement and operational terms without generating legal language or changing the source document.</p></div></div>
      {options.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Workflow preview</AlertTitle><AlertDescription>Connect Supabase to activate the sample tenancy. Draft fields still demonstrate the complete operator flow.</AlertDescription></Alert> : null}
      {options.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Lease options unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {options.requestId}.</AlertDescription></Alert> : null}
      {options.mode === "ready" && !options.properties.length ? <Alert><CircleAlert className="h-5 w-5" /><AlertTitle>Create a property first</AlertTitle><AlertDescription>The lease workflow needs an active property, unit, and scanned-clean signed document.</AlertDescription></Alert> : null}
      <ExistingLeaseForm properties={options.properties} units={options.units} documents={options.documents} initialPropertyId={query.propertyId} disabled={options.mode !== "ready" || !options.properties.length} />
    </div>
  );
}
