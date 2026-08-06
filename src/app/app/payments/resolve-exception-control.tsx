"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, LoaderCircle, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Resolution = "resolved" | "waived" | "escalated";
type Result = { reconciliationExceptionId: string; status: Resolution; batchCleared: boolean };
const label = (value: string) => value.replaceAll("_", " ");

export function ResolveExceptionControl({ exceptionId, organizationId, status, disabled }: {
  exceptionId: string; organizationId: string; status: string; disabled: boolean;
}) {
  const router = useRouter();
  const [evidence, setEvidence] = useState("");
  const [pending, setPending] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  function changed(value: string) { setEvidence(value); idempotencyKey.current = null; setError(null); }

  async function resolve(resolution: Resolution) {
    if (disabled || pending) return;
    if (resolution !== "escalated" && evidence.trim().length < 8) { setError("Record an evidence note (at least 8 characters) to resolve or waive."); return; }
    setPending(resolution); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      // Escalation's note is optional, but the schema still bounds any note to 8–1000 chars, so a
      // too-short note is omitted rather than sent (resolve/waive already require ≥8 above).
      const note = evidence.trim().length >= 8 ? evidence.trim() : undefined;
      const response = await fetch(`/api/v1/reconciliation-exceptions/${exceptionId}/resolution`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, resolution, evidence: note }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The exception could not be resolved."); }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The exception could not be resolved.");
    } finally {
      setPending(null);
    }
  }

  if (result) {
    const verb = result.status === "resolved" ? "Resolved" : result.status === "waived" ? "Waived" : "Escalated";
    return <Alert className="mt-4 border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>{verb}</AlertTitle><AlertDescription>{result.batchCleared ? "This was the last open exception, so the settlement left its exception state." : "The exception queue has been updated."}</AlertDescription></Alert>;
  }

  return <div className="mt-4 space-y-3 rounded-lg border p-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Resolution</span>
      <Badge variant={status === "escalated" ? "warning" : "neutral"}>{label(status)}</Badge>
    </div>
    <Textarea rows={2} maxLength={1000} placeholder="Record the evidence or reason (required to resolve or waive)." value={evidence} disabled={disabled || pending !== null} onChange={(event) => changed(event.target.value)} />
    {error ? <Alert variant="destructive"><AlertTitle>Not resolved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={disabled || pending !== null || evidence.trim().length < 8} onClick={() => resolve("resolved")}>{pending === "resolved" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Resolve</Button>
      <Button size="sm" variant="outline" disabled={disabled || pending !== null || evidence.trim().length < 8} onClick={() => resolve("waived")}>{pending === "waived" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleSlash className="h-4 w-4" />}Waive</Button>
      {status !== "escalated" ? <Button size="sm" variant="ghost" disabled={disabled || pending !== null} onClick={() => resolve("escalated")}>{pending === "escalated" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <TriangleAlert className="h-4 w-4" />}Escalate</Button> : null}
    </div>
  </div>;
}
