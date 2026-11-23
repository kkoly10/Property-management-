import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResidentMoveIn } from "@/lib/data/resident-move-in";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
});

function DateLabel({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(`${value}T12:00:00Z`))}</time>;
}

export function ResidentMoveInChecklist({ moveIn, canMessage = false }: {
  moveIn: ResidentMoveIn;
  canMessage?: boolean;
}) {
  const titleId = `move-in-checklist-${moveIn.tenancyId}`;
  const handedOver = moveIn.state === "handed_over";
  const missed = moveIn.state === "no_show";
  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CalendarDays aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-base font-semibold">Move-in checklist</h2>
          <p className="break-words text-sm text-muted-foreground">{moveIn.propertyName} · Unit {moveIn.unitCode}</p>
        </div>
      </div>
      <dl className="grid gap-3 rounded-lg bg-[var(--brand-subtle)] p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Tenancy starts</dt><dd className="font-medium"><DateLabel value={moveIn.startOn} /></dd></div>
        <div>
          <dt className="text-muted-foreground">{handedOver ? "Handover recorded" : missed ? "Previous appointment" : "Move-in appointment"}</dt>
          <dd className="font-medium">
            {handedOver && moveIn.handedOverOn ? <DateLabel value={moveIn.handedOverOn} />
              : moveIn.appointmentOn ? <DateLabel value={moveIn.appointmentOn} /> : "Waiting for a date"}
          </dd>
        </div>
      </dl>
      {missed ? <p className="text-sm font-medium">A new appointment is needed. Contact your property team to reschedule.</p> : null}
      {handedOver ? (
        <p className="text-sm text-muted-foreground">Keep your signed lease and any condition notes. Share any remaining access or condition issues with your property team.</p>
      ) : (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Review your signed lease and any move-in instructions.</li>
          <li>Confirm the meeting time and where to collect keys with your property team.</li>
          <li>Check the unit’s condition at handover and share any concerns with your property team.</li>
        </ol>
      )}
      {canMessage ? <Button asChild size="sm" variant="outline"><Link href="/messages">Message your property team</Link></Button> : null}
    </section>
  );
}
