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
  status: "confirmed";
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
  organizationId, tourRequestId, initialVersion, preferences, timeZone, initialMeetingLocation, disabled,
}: {
  organizationId: string;
  tourRequestId: string;
  initialVersion: number;
  preferences: Preference[];
  timeZone: string;
  initialMeetingLocation: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [retryingPosition, setRetryingPosition] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [meetingLocation, setMeetingLocation] = useState(initialMeetingLocation);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; body: unknown; position: number } | null>(null);

  async function confirm(position: number) {
    if (disabled || busy || confirmed || meetingLocation.trim().length < 3
      || (uncertain && retryingPosition !== position)) return;
    if (!operation.current) {
      if (!window.confirm("Confirm this tour time and email the visitor?")) return;
      operation.current = {
        key: crypto.randomUUID(),
        position,
        body: {
          organizationId,
          tourRequestId,
          expectedVersion: initialVersion,
          preferencePosition: position,
          meetingLocation: meetingLocation.trim(),
        },
      };
    }
    const current = operation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/rental-tours/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const result = await response.json().catch(() => null) as (Result & { error?: string }) | null;
      if (!response.ok) {
        throw new RequestFailure(result?.error ?? "The tour could not be confirmed.", response.status);
      }
      setConfirmed(result?.confirmedStartAt ?? null);
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
      setError(caught instanceof Error ? caught.message : "The confirmation result could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmed) {
    return <p className="text-sm font-semibold">Confirmed · {label(confirmed, timeZone)}</p>;
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
              disabled={disabled || busy || (uncertain && !retrying)}
              onClick={() => confirm(preference.position)}
            >
              {retrying ? "Retry same confirmation" : `Confirm ${label(preference.startsAt, timeZone)}`}
            </Button>
          );
        })}
      </div>
      {uncertain ? (
        <p className="text-xs text-warning">
          Retry the same time before choosing another; Crecy did not receive a definitive response.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
