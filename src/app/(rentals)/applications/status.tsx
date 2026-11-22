"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Status = {
  applicationReference: string; firstName: string; lastName: string;
  email: string; desiredMoveInOn: string; leaseTermText: string;
  applicantNote: string; status: "submitted" | "lease_preparation";
  listingTitle: string; rentAmountMinor: number; currencyCode: string;
  listingAvailableOn: string; version: number;
};
type State = "loading" | "ready" | "unavailable" | "error" | "withdrawn";
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function ApplicationStatus({ reference: validatedReference }: { reference: string }) {
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKey = useRef<string | null>(null);
  const reference = useRef<string | null>(null);
  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        if (!/^APP-[0-9A-F]{12}$/.test(validatedReference)) { setState("unavailable"); return; }
        reference.current = validatedReference;
        const response = await fetch(`/api/v1/rental-applications/status?ref=${encodeURIComponent(validatedReference)}`, { cache: "no-store" });
        if (canceled) return;
        if (response.status === 404) { setState("unavailable"); return; }
        if (!response.ok) { setState("error"); return; }
        const result = await response.json() as Status;
        if (canceled) return;
        if (result.applicationReference !== validatedReference) { setState("unavailable"); return; }
        setData(result);
        setState("ready");
      } catch {
        if (!canceled) setState("error");
      }
    }
    void load();
    return () => { canceled = true; };
  }, [validatedReference]);

  async function withdraw() {
    if (busy || state !== "ready") return;
    operationKey.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const currentReference = reference.current;
      if (!currentReference || !data) { setState("unavailable"); return; }
      const response = await fetch(`/api/v1/rental-applications/withdraw?ref=${encodeURIComponent(currentReference)}`, {
        method: "POST",
        headers: { "idempotency-key": operationKey.current },
      });
      const result = await response.json().catch(() => null) as {
        error?: string; withdrawn?: unknown; applicationReference?: unknown;
        status?: unknown; version?: unknown;
      } | null;
      if (!response.ok) {
        throw new RequestFailure(result?.error ?? "Withdrawal could not be confirmed.", response.status);
      }
      // Do not discard an applicant's local status on a bare 2xx. A valid
      // receipt must confirm this exact reference transitioned to withdrawn.
      if (result?.withdrawn !== true || result.applicationReference !== currentReference
        || result.status !== "withdrawn" || typeof result.version !== "number"
        || !Number.isInteger(result.version) || result.version <= data.version) {
        throw new RequestFailure("Withdrawal could not be confirmed. Retry the same operation.", 502);
      }
      setData(null);
      setUncertain(false);
      setState("withdrawn");
      operationKey.current = null;
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        operationKey.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }
      setError(caught instanceof Error ? caught.message : "Withdrawal response was interrupted.");
    } finally {
      setBusy(false);
    }
  }
  if (state === "loading") return <p className="mt-6 text-sm text-muted-foreground">Loading your application…</p>;
  if (state === "unavailable") return (
    <Alert className="mt-8">
      <AlertTitle>Application access is unavailable</AlertTitle>
      <AlertDescription>
        Use the application-status link from your original verification. Access may have expired,
        or the application may have been withdrawn, closed, or converted.
      </AlertDescription>
    </Alert>
  );
  if (state === "error") return <p role="alert" className="mt-6 text-destructive">
    Your application could not be loaded. Refresh to try again.
  </p>;
  if (state === "withdrawn") return (
    <Alert className="mt-8">
      <AlertTitle>Application withdrawn</AlertTitle>
      <AlertDescription>Your application is no longer active, and its private access has ended.</AlertDescription>
    </Alert>
  );
  if (!data) return null;
  const rent = new Intl.NumberFormat("en-US", {
    style: "currency", currency: data.currencyCode,
  }).format(data.rentAmountMinor / 100);
  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <p className="font-mono text-xs text-muted-foreground">{data.applicationReference}</p>
        <h2 className="mt-2 text-xl font-semibold">{data.listingTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.status === "lease_preparation"
            ? "The landlord is preparing lease details. Nothing is final until the agreement is signed."
            : "Submitted and visible to the landlord. This is not an approval or reservation."}
        </p>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Applicant</dt>
            <dd className="mt-1 font-semibold">{data.firstName} {data.lastName}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt>
            <dd className="mt-1 break-words font-semibold">{data.email}</dd></div>
          <div><dt className="text-muted-foreground">Desired move-in</dt>
            <dd className="mt-1 font-semibold">{data.desiredMoveInOn}</dd></div>
          <div><dt className="text-muted-foreground">Advertised monthly rent</dt>
            <dd className="mt-1 font-semibold">{rent}</dd></div>
        </dl>
        {data.leaseTermText ? (
          <p className="mt-4 text-sm"><span className="text-muted-foreground">Preferred term: </span>
            {data.leaseTermText}</p>
        ) : null}
        {data.applicantNote ? (
          <p className="mt-4 whitespace-pre-wrap break-words text-sm">{data.applicantNote}</p>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {uncertain ? <p className="text-sm text-muted-foreground">
        The response was interrupted. Retry this same withdrawal to confirm it.
      </p> : null}
      <Button type="button" variant="outline" disabled={busy} onClick={withdraw}>
        {busy ? "Withdrawing…" : uncertain ? "Retry withdrawal" : "Withdraw my application"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Withdrawal cannot be reversed here. If your landlord has already activated a signed lease,
        contact them about your tenancy rather than this application.
      </p>
    </div>
  );
}
