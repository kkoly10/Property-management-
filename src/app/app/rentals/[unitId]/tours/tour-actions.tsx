"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Preference = { position: number; startsAt: string };
type Result = {
  tourRequestId: string;
  publicReference: string;
  status: "confirmed" | "cancelled";
  version: number;
  confirmedPreferencePosition: number;
  confirmedStartAt: string;
  timeZone: string;
  meetingLocation: string;
};
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function label(startsAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(startsAt));
}

export function TourActions({
  organizationId, tourRequestId, initialVersion, preferences, timeZone, initialMeetingLocation, currentPosition = null, disabled,
}: {
  organizationId: string;
  tourRequestId: string;
  initialVersion: number;
  preferences: Preference[];
  timeZone: string;
  initialMeetingLocation: string;
  currentPosition?: number | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [retryingPosition, setRetryingPosition] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [meetingLocation, setMeetingLocation] = useState(initialMeetingLocation);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; body: unknown; position: number } | null>(null);

  async function manage(position: number) {
    const cancelling = position === -1;
    if (disabled || busy || receipt || (!cancelling && meetingLocation.trim().length < 3)
      || (uncertain && retryingPosition !== position)) return;
    if (!operation.current) {
      const prompt = cancelling ? "Cancel this tour request and email the visitor?"
        : currentPosition === null ? "Confirm this tour time and email the visitor?"
        : "Update this tour and email the visitor?";
      if (!window.confirm(prompt)) return;
      operation.current = {
        key: crypto.randomUUID(),
        position,
        body: {
          organizationId,
          tourRequestId,
          expectedVersion: initialVersion,
          ...(cancelling ? {} : { preferencePosition: position, meetingLocation: meetingLocation.trim() }),
        },
      };
    }
    const current = operation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/rental-tours/${cancelling ? "cancel" : "confirm"}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const result = await response.json().catch(() => null) as (Result & { error?: string }) | null;
      if (!response.ok) {
        throw new RequestFailure(result?.error ?? "The tour update could not be confirmed.", response.status);
      }
      if (result?.tourRequestId !== tourRequestId || result.version <= initialVersion
        || result.status !== (cancelling ? "cancelled" : "confirmed") || (!cancelling && !result.confirmedStartAt)) {
        throw new RequestFailure("The tour update receipt could not be verified.", 502);
      }
      setReceipt(cancelling ? "Canceled" : `Confirmed · ${label(result.confirmedStartAt, timeZone)}`);
      setUncertain(false);
      setRetryingPosition(null);
      operation.current = null;
      router.refresh();
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        operation.current = null;
        setUncertain(false);
        setRetryingPosition(null);
      } else {
        setUncertain(true);
        setRetryingPosition(current.position);
      }
      setError(caught instanceof Error ? caught.message : "The tour update could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return <p className="text-sm font-semibold" role="status">{receipt}</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`tour-location-${tourRequestId}`}>Private meeting location</Label>
        <Input
          id={`tour-location-${tourRequestId}`}
          className="mt-2"
          value={meetingLocation}
          maxLength={500}
          disabled={disabled || busy || uncertain}
          onChange={(event) => {
            operation.current = null;
            setRetryingPosition(null);
            setMeetingLocation(event.target.value);
            setError(null);
          }}
        />
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          This address is not added to the public listing. It is sent to this verified visitor only after you confirm a time.
        </p>
      </div>
      <div className="grid gap-2">
        {preferences.map((preference) => {
          const retrying = uncertain && retryingPosition === preference.position;
          return (
            <Button
              key={preference.position}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || busy || (uncertain && !retrying)
                || (preference.position === currentPosition && meetingLocation.trim() === initialMeetingLocation.trim())}
              onClick={() => manage(preference.position)}
            >
              {retrying ? "Retry same update"
                : `${currentPosition === null ? "Confirm" : "Use"} ${label(preference.startsAt, timeZone)}`}
            </Button>
          );
        })}
      </div>
      <Button type="button" size="sm" variant="outline"
        disabled={disabled || busy || (uncertain && retryingPosition !== -1)} onClick={() => manage(-1)}>
        {uncertain && retryingPosition === -1 ? "Retry same cancellation" : "Cancel tour"}
      </Button>
      {uncertain ? (
        <p className="text-xs text-warning">
          Retry the same action so Crecy can check whether the previous update succeeded.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
