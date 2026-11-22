"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/actions/state";
import { recordMoveInAction } from "@/lib/tenancies/move-in-action";
import type { MoveInState } from "@/lib/tenancies/move-in-state";

const formLabels = {
  plan: "Plan or reschedule handover",
  no_show: "Record a no-show",
  handover: "Confirm keys and condition",
};

export function MoveInForm({ mode, moveIn, organizationId, operationId }: {
  mode: keyof typeof formLabels;
  moveIn: MoveInState;
  organizationId: string;
  operationId: string;
}) {
  const [result, action, busy] = useActionState(recordMoveInAction, initialActionState);
  const nextDay = moveIn.startOn > moveIn.localToday ? moveIn.startOn : moveIn.localToday;
  const endOfActual = moveIn.endOn && moveIn.endOn < moveIn.localToday ? moveIn.endOn : moveIn.localToday;
  const defaultDate = mode === "plan"
    ? moveIn.plannedOn && moveIn.plannedOn > nextDay ? moveIn.plannedOn : nextDay
    : endOfActual;
  return <section className="rounded-xl border bg-card p-4 sm:p-5">
    <h2 className="text-lg font-semibold">{formLabels[mode]}</h2>
    <form action={action} className="mt-4 grid gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="tenancyId" value={moveIn.tenancyId} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="expectedVersion" value={moveIn.version} />
      <input type="hidden" name="action" value={mode} />
      {mode === "no_show" ? <>
        <input type="hidden" name="eventOn" value={moveIn.plannedOn ?? ""} />
        <p className="text-sm text-muted-foreground">Record that keys were not transferred at the appointment on {moveIn.plannedOn}.</p>
      </> : <div className="grid max-w-56 gap-2">
        <Label htmlFor={mode + "-move-in-date"}>{mode === "plan" ? "Appointment date" : "Actual handover date"}</Label>
        <Input name="eventOn" id={mode + "-move-in-date"} type="date" defaultValue={defaultDate} required
          min={mode === "plan" ? nextDay : moveIn.startOn} max={mode === "plan" ? moveIn.endOn ?? undefined : endOfActual} />
      </div>}
      {mode === "plan" ? <p className="text-sm text-muted-foreground">A planned handover holds the scheduled tenancy until you record the transfer.</p> : null}
      {mode === "handover" ? <>
        <div className="grid max-w-56 gap-2"><Label htmlFor="move-in-keys">Keys or access devices transferred</Label><Input id="move-in-keys" name="keys" type="number" min={0} max={100} required /></div>
        <div className="grid gap-2"><Label htmlFor="move-in-condition">Condition checklist reference or brief summary</Label><Input id="move-in-condition" name="condition" maxLength={240} required /><p className="text-sm text-muted-foreground">Keep access codes and other secrets out of this record.</p></div>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="keepDates" required /><span>I reviewed the lease and rent schedule. This move-in record keeps the existing dates.</span></label>
      </> : null}
      {result.message ? <p role={result.status === "error" ? "alert" : "status"} className={result.status === "error" ? "text-sm text-destructive" : "text-sm"}>{result.message}</p> : null}
      <Button className="w-fit" type="submit" disabled={busy}>{busy ? "Saving…" : formLabels[mode]}</Button>
    </form>
  </section>;
}
