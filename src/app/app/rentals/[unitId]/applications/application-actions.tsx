"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "submitted" | "lease_preparation" | "closed";
type Action = "prepare" | "close";
class RequestFailure extends Error {
  constructor(message: string, public httpStatus: number) { super(message); }
}

export function ApplicationActions({ organizationId, applicationId, initialVersion, status: initialStatus, unitId, disabled }: {
  organizationId: string; applicationId: string; initialVersion: number;
  status: "submitted" | "lease_preparation"; unitId: string; disabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [retryAction, setRetryAction] = useState<Action | null>(null);
  const operation = useRef<{ action: Action; key: string; body: unknown } | null>(null);
  // A ref closes the gap before React commits a busy-state render: two rapid
  // clicks must never send competing commands with the same operation receipt.
  const inFlight = useRef(false);
  async function run(action: Action) {
    if (disabled || inFlight.current || busy || status === "closed") return;
    if (operation.current && operation.current.action !== action) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    try {
      operation.current ??= {
        action, key: crypto.randomUUID(),
        body: { organizationId, applicationId, expectedVersion: version },
      };
      const current = operation.current;
      const response = await fetch(`/api/v1/rental-applications/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const body = await response.json().catch(() => null) as {
        error?: string; applicationId?: string; status?: string;
        applicationVersion?: number; version?: number; unitId?: string;
      } | null;
      if (!response.ok) {
        throw new RequestFailure(body?.error ?? "The operation could not be confirmed.", response.status);
      }
      const nextVersion = action === "close" ? body?.version : body?.applicationVersion;
      const expectedStatus = action === "close" ? "closed" : "lease_preparation";
      // A 2xx without the transaction receipt is not confirmation. Keep the same
      // key/body for a safe retry instead of navigating to an unproven lease.
      if (body?.applicationId !== applicationId || body?.status !== expectedStatus
        || typeof nextVersion !== "number" || !Number.isInteger(nextVersion) || nextVersion <= version
        || (action === "prepare" && body?.unitId !== unitId)) {
        throw new RequestFailure("The operation receipt was incomplete. Retry the same operation.", 502);
      }
      setVersion(nextVersion);
      setStatus(expectedStatus);
      operation.current = null;
      setUncertain(false);
      setRetryAction(null);
      if (action === "prepare") router.push(`/app/rentals/${unitId}/setup`);
      router.refresh();
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.httpStatus < 500;
      if (definite) {
        operation.current = null;
        setUncertain(false);
        setRetryAction(null);
      } else {
        setUncertain(true);
        setRetryAction(action);
      }
      setError(caught instanceof Error ? caught.message : "The operation could not be confirmed.");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  if (status === "closed") return <span className="text-xs text-muted-foreground">Closed</span>;
  return (
    <div className="space-y-2">
      {status === "submitted" ? (
        <Button type="button" size="sm"
          disabled={disabled || Boolean(busy) || (uncertain && retryAction !== "prepare")}
          onClick={() => run("prepare")}>
          {busy === "prepare" ? "Preparing…" : uncertain && retryAction === "prepare"
            ? "Retry same preparation" : "Prepare lease"}
        </Button>
      ) : disabled || Boolean(busy) || uncertain ? (
        <Button type="button" size="sm" variant="outline" disabled>
          Continue lease setup
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/rentals/${unitId}/setup`}>Continue lease setup</Link>
        </Button>
      )}
      <Button type="button" size="sm" variant="outline"
        disabled={disabled || Boolean(busy) || uncertain && retryAction !== "close"}
        onClick={() => run("close")}>
        {busy === "close" ? "Closing…" : "Close application"}
      </Button>
      {uncertain ? <p className="text-xs text-muted-foreground">
        Retry the same operation before changing anything else.
      </p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
