import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { LivingShell } from "@/components/living/living-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getResidentMaintenanceWorkspace } from "@/lib/data/maintenance";
import { MaintenanceRequestForm } from "./maintenance-request-form";

export const dynamic = "force-dynamic";

export default async function NewMaintenanceRequestPage() {
  const workspace = await getResidentMaintenanceWorkspace();

  return (
    <LivingShell maxWidth="max-w-3xl">
      <div className="space-y-6">
        <PageHeader
          context={
            <Link href="/maintenance" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Requests
            </Link>
          }
          title="Report an issue"
          description="Tell the property team what is happening, add photos if useful, and share when they can visit."
        />

        {workspace.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Maintenance preview</AlertTitle>
            <AlertDescription>This sample shows the intake experience until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Maintenance unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        <section className="overflow-hidden rounded-[1.1rem] border bg-card">
          <div className="border-b bg-[var(--brand-subtle)] px-5 py-4 sm:px-6">
            <p className="text-sm font-semibold">Issue details</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Your text draft stays on this device while you work. Photos upload only when you submit.</p>
          </div>
          <div className="p-5 sm:p-6">
            <MaintenanceRequestForm tenancies={workspace.tenancies} disabled={workspace.mode !== "ready"} />
          </div>
        </section>
      </div>
    </LivingShell>
  );
}
