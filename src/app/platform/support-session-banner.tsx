"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SupportSessionRow } from "@/lib/data/platform-support";

// Persistent, prominent banner shown whenever the platform actor holds an active support session,
// naming the target org + expiry and offering an explicit End. This is audited support access — the
// support actor reads sanitized diagnostics only and can mutate no tenant data.
export function SupportSessionBanner({ sessions }: { sessions: SupportSessionRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  if (!sessions.length) return null;

  async function end(session: SupportSessionRow) {
    setPendingId(session.supportSessionId);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/platform/support-sessions/${session.supportSessionId}/end`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId: session.organizationId, disposition: "ended", idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The session could not be ended."); }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The session could not be ended.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 text-amber-950">
      {sessions.map((session) => (
        <div key={session.supportSessionId} className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Support session active for <span className="font-semibold">{session.organizationName ?? session.organizationId}</span>
              {session.expiresAt ? <> · expires {new Date(session.expiresAt).toLocaleString()}</> : null} · read-only audited access
            </span>
          </p>
          <div className="flex items-center gap-3">
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
            <Button size="sm" variant="outline" disabled={pendingId === session.supportSessionId} onClick={() => end(session)}>
              {pendingId === session.supportSessionId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
              End session
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
