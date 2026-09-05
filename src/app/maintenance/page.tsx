import Link from "next/link";
import { ArrowRight, Camera, CircleAlert, Clock3, Plus, ShieldCheck, Wrench } from "lucide-react";
import { EmptyState } from "@/components/crecy/empty-state";
import { PageHeader } from "@/components/crecy/page-header";
import { LivingShell } from "@/components/living/living-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getResidentMaintenanceWorkspace } from "@/lib/data/maintenance";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  scheduled: "Scheduled",
  being_repaired: "Being repaired",
  waiting_for_confirmation: "Waiting for confirmation",
  completed: "Completed",
  canceled: "Canceled",
};

export default async function ResidentMaintenancePage() {
  const workspace = await getResidentMaintenanceWorkspace();
  const open = workspace.items.filter((item) => !["completed", "canceled"].includes(item.residentVisibleStatus)).length;

  return (
    <LivingShell maxWidth="max-w-5xl">
      <div className="space-y-6">
        <PageHeader
          title="Maintenance requests"
          description={open
            ? `${open} open request${open === 1 ? "" : "s"}. Follow progress or tell the property team about something new.`
            : "Report an issue and follow its resident-visible progress from submission through completion."}
          actions={
            <Button asChild>
              <Link href="/maintenance/new">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Report an issue
              </Link>
            </Button>
          }
        />

        {workspace.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Maintenance preview</AlertTitle>
            <AlertDescription>This sample shows how requests will appear when Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Requests unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        {workspace.items.length ? (
          <section aria-label="Your maintenance requests" className="overflow-hidden rounded-[1.05rem] border bg-card">
            <div className="divide-y">
              {workspace.items.map((item) => (
                <Link
                  key={item.maintenanceRequestId}
                  href={`/maintenance/${item.maintenanceRequestId}`}
                  className="group grid gap-4 px-5 py-5 transition-colors hover:bg-[var(--brand-subtle)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.residentVisibleStatus === "completed" ? "success" : item.residentVisibleStatus === "canceled" ? "neutral" : "info"}>
                        {statusLabel[item.residentVisibleStatus] ?? item.residentVisibleStatus}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span>
                    </div>
                    <h2 className="mt-3 text-base font-semibold tracking-[-0.015em] group-hover:text-primary">{item.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{item.propertyName} · Unit {item.unitCode} · {item.category.replaceAll("_", " ")}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{new Date(item.createdAt).toLocaleDateString()}</span>
                      <span className="inline-flex items-center gap-1"><Camera aria-hidden="true" className="h-3.5 w-3.5" />{item.evidenceCount} photo{item.evidenceCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        ) : workspace.mode !== "error" ? (
          <div className="overflow-hidden rounded-[1.05rem] border bg-card">
            <EmptyState
              icon={Wrench}
              title="No maintenance requests"
              description="When something in your home needs attention, start a request here."
              action={<Button asChild><Link href="/maintenance/new">Report an issue</Link></Button>}
            />
          </div>
        ) : null}
      </div>
    </LivingShell>
  );
}
