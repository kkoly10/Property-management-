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
  // One idempotency key per session+action, minted lazily and reused across a genuine retry so the End
  // call replays idempotently; cleared for that session on any HTTP failure so a fresh attempt re-mints.
  // A single shared key would collide across sessions (different org/session → IDEMPOTENCY_CONFLICT).
  const idempotencyKeys = useRef<Map<string, string>>(new Map());

  if (!sessions.length) return null;

  async function end(session: SupportSessionRow) {
    setPendingId(session.supportSessionId);
    setError(null);
    const keyMap = idempotencyKeys.current;
    let key = keyMap.get(session.supportSessionId);
    if (!key) { key = crypto.randomUUID(); keyMap.set(session.supportSessionId, key); }
    try {
      const response = await fetch(`/api/v1/platform/support-sessions/${session.supportSessionId}/end`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ organizationId: session.organizationId, disposition: "ended", idempotencyKey: key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { keyMap.delete(session.supportSessionId); throw new Error(body.error ?? "The session could not be ended."); }
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
