import Link from "next/link";
import { CalendarCheck2, Mail } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRentalTourWorkspace } from "@/lib/data/rental-tours";
import { TourActions } from "./tour-actions";

export const dynamic = "force-dynamic";

function localTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

export default async function RentalToursPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const workspace = await getRentalTourWorkspace(unitId);
  if (workspace.mode === "unavailable") redirect("/app");
  if (workspace.mode === "not_found") notFound();
  if (workspace.mode === "error") {
    return <p role="alert">Tour requests could not be loaded. Refresh to try again.</p>;
  }
  const preview = workspace.mode === "setup";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link href={`/app/rentals/${unitId}`} className="text-sm font-medium text-primary">Back to my rental</Link>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Tour requests</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{workspace.unitName}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Only email-verified requests appear here. Confirming a time schedules a 30-minute tour;
          it does not approve, rank, or qualify a prospective renter.
        </p>
      </header>

      {preview ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Sample tour preview. The person, email and times below are fictional.
        </p>
      ) : null}

      {workspace.items.length ? (
        <div className="space-y-4">
          {workspace.items.map((item) => (
            <article key={item.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.firstName} {item.lastName}</h2>
                    <Badge variant={item.status === "confirmed" ? "success" : "info"}>{item.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail aria-hidden="true" className="h-4 w-4" />{item.email}
                    </span>
                    <span>{item.propertyTimeZone}</span>
                  </div>

                  {item.status === "confirmed" && item.confirmedStartAt ? (
                    <div className="mt-4 flex items-start gap-3 rounded-lg bg-muted/45 p-4">
                      <CalendarCheck2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Confirmed tour</p>
                        <p className="mt-1 font-semibold">{localTime(item.confirmedStartAt, item.propertyTimeZone)}</p>
                        {item.confirmedMeetingLocation ? (
                          <p className="mt-2 break-words text-sm text-muted-foreground">
                            Meeting location: {item.confirmedMeetingLocation}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-muted-foreground">Preferred times</p>
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                        {item.preferences.map((preference) => (
                          <li key={preference.position} className="rounded-lg bg-muted/45 px-3 py-2 text-sm">
                            {localTime(preference.startsAt, item.propertyTimeZone)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
                  <Button asChild size="sm" variant="outline">
                    <a href={`mailto:${encodeURIComponent(item.email)}`}>Reply by email</a>
                  </Button>
                  {item.status === "requested" ? (
                    <TourActions
                      organizationId={workspace.organizationId ?? ""}
                      tourRequestId={item.id}
                      initialVersion={item.version}
                      preferences={item.preferences.map((preference) => ({
                        position: preference.position, startsAt: preference.startsAt,
                      }))}
                      timeZone={item.propertyTimeZone}
                      initialMeetingLocation={workspace.meetingLocationDefault}
                      disabled={preview}
                    />
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">No verified tour requests yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A request appears here only after the visitor verifies their email.
          </p>
        </div>
      )}
    </div>
  );
}
