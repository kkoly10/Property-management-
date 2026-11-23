"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConversationRequestError, conversationRequest } from "@/components/rentals/rental-conversation-thread";
import { prospectTourState, type ProspectTourState } from "@/lib/rental-conversation";

type TourAction = "tour-cancel" | "tour-reschedule";
type TourWrite = { action: TourAction; reference: string; version: number; operation: string; preferences?: string[] };

export function ProspectTourActions({ reference, tour, onChange }: {
  reference: string; tour: ProspectTourState; onChange: (tour: ProspectTourState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [preferences, setPreferences] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<TourAction | null>(null);
  const [error, setError] = useState("");
  const operation = useRef<TourWrite | null>(null);
  const choiceLimit = tour.confirmedStartAt ? 2 : 3;
  const format = (value: string) => new Intl.DateTimeFormat("en-US", {
    timeZone: tour.timeZone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));

  async function send(action: TourAction) {
    if (!tour.canManage || busy || (uncertain && action !== uncertain)) return;
    if (!operation.current) {
      const times = preferences.slice(0, choiceLimit).filter(Boolean);
      if (action === "tour-reschedule" && (!times.length || new Set(times).size !== times.length)) {
        setError("Choose at least one future time and enter each time once.");
        return;
      }
      if (action === "tour-cancel" && !window.confirm("Cancel your tour and notify the landlord?")) return;
      operation.current = { action, reference, version: tour.version, operation: crypto.randomUUID(),
        ...(action === "tour-reschedule" ? { preferences: times } : {}) };
    }
    const request = operation.current;
    setBusy(true);
    setError("");
    try {
      const response = await conversationRequest("/api/v1/rental-conversations", request);
      const updated = prospectTourState.parse(response.tour);
      if (updated.version !== request.version + 1
        || (action === "tour-cancel" ? updated.status !== "cancelled" : !updated.changePending)) {
        throw new Error("The tour update receipt could not be confirmed.");
      }
      operation.current = null;
      setUncertain(null);
      setEditing(false);
      setPreferences(["", "", ""]);
      onChange(updated);
    } catch (cause) {
      if (cause instanceof ConversationRequestError && cause.status < 500) {
        operation.current = null;
        setUncertain(null);
      } else {
        setUncertain(action);
      }
      setError(cause instanceof Error ? cause.message : "The tour update could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Manage your tour">
      <h2 className="font-semibold">Your tour</h2>
      {tour.status === "cancelled" ? <p role="status" className="text-sm">Your tour is canceled.</p>
        : <>
          {tour.confirmedStartAt ? <div className="space-y-1 text-sm">
            <p>Confirmed for {format(tour.confirmedStartAt)} ({tour.timeZone})</p>
            {tour.meetingLocation ? <p className="break-words">{tour.meetingLocation}</p> : null}
          </div> : <p className="text-sm">The landlord has your request and will confirm a time.</p>}
          {tour.changePending ? <p role="status" className="text-sm">
            New times sent to the landlord. {tour.confirmedStartAt ? "Your current appointment stays confirmed until the landlord confirms a new time." : "The landlord will review the new choices."}
          </p> : null}
          {tour.preferences.length && tour.changePending ? <ul className="list-disc space-y-1 pl-5 text-sm">
            {tour.preferences.map((time) => <li key={time}>{format(time)}</li>)}
          </ul> : null}
        </>}
      {tour.canManage ? <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || Boolean(uncertain)}
          aria-expanded={editing} onClick={() => { setEditing(!editing); setError(""); }}>
          {editing ? "Hide time choices" : "Propose new times"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || uncertain === "tour-reschedule"}
          onClick={() => void send("tour-cancel")}>{uncertain === "tour-cancel" ? "Retry cancellation" : "Cancel tour"}</Button>
      </div> : null}
      {editing && tour.canManage ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void send("tour-reschedule"); }}>
        <p className="text-sm text-muted-foreground">Enter times in the rental’s time zone ({tour.timeZone}).</p>
        {preferences.slice(0, choiceLimit).map((value, i) => {
          const id = `${reference}-tour-time-${i}`;
          return <div key={id}>
            <Label htmlFor={id}>{i === 0 ? "First choice" : `Choice ${i + 1} (optional)`}</Label>
            <Input id={id} className="mt-1 min-w-0" type="datetime-local" value={value} required={i === 0}
              disabled={busy || Boolean(uncertain)} onChange={(event) => {
                setPreferences((previous) => previous.map((time, index) => index === i ? event.target.value : time));
              }} />
          </div>;
        })}
        <Button type="submit" size="sm" disabled={busy || uncertain === "tour-cancel"}>
          {uncertain === "tour-reschedule" ? "Retry same times" : "Send times to landlord"}
        </Button>
      </form> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
