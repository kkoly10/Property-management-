"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleX, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Decision = "approved" | "rejected";
type Result = { decision: Decision; workOrderStatus: string; workOrderApprovalStatus: string };

export function OwnerApprovalForm({ approvalRequestId, version, disabled }: { approvalRequestId: string; version: number; disabled: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function decide(decision: Decision) {
    setPending(decision);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/owner-approvals/${approvalRequestId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined, expectedVersion: version }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) {
        idempotencyKey.current = null;
        throw new Error(body.error ?? "Your decision could not be recorded.");
      }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your decision could not be recorded.");
    } finally {
      setPending(null);
    }
  }

  if (result) return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Decision recorded</AlertTitle><AlertDescription>This request is {result.decision}. The work order approval status is {result.workOrderApprovalStatus.replaceAll("_", " ")}.</AlertDescription></Alert>;

  return <div className="space-y-4">
    {error ? <Alert variant="destructive"><AlertTitle>Decision not recorded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="space-y-2"><Label htmlFor="approval-reason">Comment</Label><Textarea id="approval-reason" minLength={3} maxLength={1000} placeholder="Optional for approval; required for rejection." value={reason} disabled={disabled || pending !== null} onChange={(event) => { setReason(event.target.value); idempotencyKey.current = null; setError(null); }} /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Button size="lg" disabled={disabled || pending !== null} onClick={() => decide("approved")}>{pending === "approved" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve</Button>
      <Button size="lg" variant="destructive" disabled={disabled || pending !== null || reason.trim().length < 3} onClick={() => decide("rejected")}>{pending === "rejected" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}Reject</Button>
    </div>
  </div>;
}
