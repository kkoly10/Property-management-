import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, CircleAlert, KeyRound, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { LivingRequestProgress } from "@/components/living/living-request-progress";
import { LivingShell } from "@/components/living/living-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getResidentMaintenanceDetail } from "@/lib/data/maintenance";

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

export default async function ResidentMaintenanceDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const result = await getResidentMaintenanceDetail(requestId);
  if (!result.item && result.mode !== "error") notFound();
  const item = result.item;

  return (
    <LivingShell maxWidth="max-w-3xl">
      <div className="space-y-6">
        <Link href="/maintenance" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Requests
        </Link>

        {result.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Request unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {result.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        {item ? (
          <>
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.residentVisibleStatus === "completed" ? "success" : item.residentVisibleStatus === "canceled" ? "neutral" : "info"}>
                  {statusLabel[item.residentVisibleStatus] ?? item.residentVisibleStatus}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span>
              </div>
              <h1 className="mt-3 text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.04em] sm:text-[2.15rem]">{item.title}</h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin aria-hidden="true" className="h-4 w-4" />
                {item.propertyName} · Unit {item.unitCode}
              </p>
            </header>

            <LivingRequestProgress status={item.residentVisibleStatus} />

            <section className="overflow-hidden rounded-[1.05rem] border bg-card">
              <div className="border-b px-5 py-4 sm:px-6">
                <p className="text-sm font-semibold">What you reported</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.category.replaceAll("_", " ")} · submitted {new Date(item.createdAt).toLocaleString()}</p>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <p className="whitespace-pre-wrap text-sm leading-7">{item.description}</p>
                <dl className="mt-5 divide-y border-y">
                  <div className="grid gap-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)]">
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Camera aria-hidden="true" className="h-4 w-4" />Photos</dt>
                    <dd className="text-sm">{item.evidenceCount} {item.evidenceCount === 1 ? "photo" : "photos"} attached</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)]">
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><KeyRound aria-hidden="true" className="h-4 w-4" />Access instructions</dt>
                    <dd className="text-sm">{item.accessPermission ?? "None recorded"}</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)]">
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarDays aria-hidden="true" className="h-4 w-4" />Preferred visit</dt>
                    <dd className="text-sm">
                      {item.preferredTimes.length
                        ? `${new Date(item.preferredTimes[0].start).toLocaleString()} – ${new Date(item.preferredTimes[0].end).toLocaleString()}`
                        : "No preferred window recorded"}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <Alert variant="info">
              <CircleAlert aria-hidden="true" className="h-5 w-5" />
              <AlertTitle>Your property team controls the official triage priority</AlertTitle>
              <AlertDescription>Status updates appear here without exposing private vendor details, internal notes, or cost information.</AlertDescription>
            </Alert>
          </>
        ) : null}
      </div>
    </LivingShell>
  );
}
