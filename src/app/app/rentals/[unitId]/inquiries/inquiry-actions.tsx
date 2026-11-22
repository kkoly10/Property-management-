"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Result = { inquiryId: string; publicReference: string; status: "closed"; version: number };
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function InquiryActions({ organizationId, inquiryId, initialVersion, disabled }: {
  organizationId: string;
  inquiryId: string;
  initialVersion: number;
  disabled?: boolean;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; body: unknown } | null>(null);

  async function close() {
    if (disabled || busy || closed) return;
    setBusy(true); setError(null);
    try {
      operation.current ??= {
        key: crypto.randomUUID(),
        body: { organizationId, inquiryId, expectedVersion: version },
      };
      const current = operation.current;
      const response = await fetch("/api/v1/rental-inquiries/close", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const result = await response.json().catch(() => null) as (Result & { error?: string }) | null;
      if (!response.ok) {
        throw new RequestFailure(result?.error ?? "The inquiry could not be closed.", response.status);
      }
      setVersion(result?.version ?? version + 1);
      setClosed(true);
      setUncertain(false);
      operation.current = null;
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        operation.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }
      setError(caught instanceof Error ? caught.message : "The close result could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) return <span className="text-xs font-semibold text-muted-foreground">Closed</span>;

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={close}>
        {uncertain ? "Retry same close" : busy ? "Closing…" : "Mark closed"}
      </Button>
      {uncertain ? <p className="max-w-52 text-xs text-warning">Retry this same close before taking another action.</p> : null}
      {error ? <p role="alert" className="max-w-52 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
