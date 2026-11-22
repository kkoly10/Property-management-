"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Receipt } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type Result = { workOrderId: string; journalTransactionId: string; amountMinor: number; currencyCode: string };
type ApprovalResult = { approvalStatus: "pending" | "approved"; approvalRound: number };
type Action = "post" | "request";
const toMinor = (value: string) => { if (!value.trim()) return null; const number = Number(value); return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };
const fromMinor = (amountMinor: number | null) => amountMinor !== null ? (amountMinor / 100).toFixed(2) : "";

export function RecordCostForm({ workOrderId, organizationId, version, approvalOnly, defaultCurrencyCode, suggestedAmountMinor, disabled }: {
  workOrderId: string; organizationId: string; version: number; approvalOnly: boolean;
  defaultCurrencyCode: string | null; suggestedAmountMinor: number | null; disabled: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(fromMinor(suggestedAmountMinor));
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode ?? "USD");
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approval, setApproval] = useState<ApprovalResult | null>(null);
  const idempotencyKeys = useRef<Partial<Record<Action, string>>>({});

  function changed() { idempotencyKeys.current = {}; setError(null); setApproval(null); }

  async function submit(action: Action) {
    if (disabled || pending) return;
    const amountMinor = toMinor(amount);
    const allowScopeOnly = action === "request" && approvalOnly;
    if (amount.trim() && amountMinor === null) { setError("Enter a valid cost amount."); return; }
    if (!allowScopeOnly && (amountMinor === null || amountMinor <= 0)) { setError("Enter a cost amount greater than zero."); return; }
    setPending(action); setError(null);
    idempotencyKeys.current[action] ??= crypto.randomUUID();
    try {
      const endpoint = action === "request"
        ? `/api/v1/work-orders/${workOrderId}/cost-approval`
        : `/api/v1/work-orders/${workOrderId}/cost`;
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKeys.current[action] },
        body: JSON.stringify({ organizationId, amountMinor: amountMinor ?? undefined, currencyCode, memo: memo.trim() || undefined, expectedVersion: version }),
      });
      const body = await response.json() as Result & ApprovalResult & { error?: string; code?: string };
      if (!response.ok) {
        if (body.code === "WORK_ORDER_COST_APPROVAL_REQUIRED") setApprovalRequired(true);
        if (response.status < 500 && response.status !== 409) delete idempotencyKeys.current[action];
        throw new Error(body.error ?? "The cost update could not be saved.");
      }
      if (action === "request") {
        if (body.approvalStatus !== "pending" && body.approvalStatus !== "approved") throw new Error("Retry to confirm the approval request.");
        delete idempotencyKeys.current.request;
        setApproval(body);
      } else {
        if (!body.journalTransactionId) throw new Error("Retry to confirm the ledger posting.");
        setResult(body);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The cost update could not be saved.");
    } finally {
      setPending(null);
    }
  }

  if (result) {
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: result.currencyCode }).format(result.amountMinor / 100);
    return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Cost posted to the ledger</AlertTitle><AlertDescription>{formatted} recorded as a repairs expense.</AlertDescription></Alert>;
  }

  const busy = disabled || pending !== null;
  return <form onSubmit={(event) => { event.preventDefault(); void submit(approvalOnly ? "request" : "post"); }} className="space-y-5">
    <WorkspacePanel
      title={approvalOnly ? "Owner cost approval" : "Record maintenance cost"}
      description={approvalOnly
        ? "Request review again if the actual cost or property ownership changed."
        : "Post the cost as a repairs expense and accounts payable. The posting flows onto the owner statement."}
      bodyClassName="space-y-4 p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="wo-cost-amount">Cost amount</Label><Input id="wo-cost-amount" inputMode="decimal" required={!approvalOnly} placeholder="0.00" value={amount} disabled={busy} onChange={(event) => { setAmount(event.target.value); changed(); }} /></div>
        <div className="space-y-2"><Label htmlFor="wo-cost-currency">Currency</Label><NativeSelect id="wo-cost-currency" value={currencyCode} disabled={busy} onChange={(event) => { setCurrencyCode(event.target.value); changed(); }}><option value="USD">USD</option><option value="CAD">CAD</option><option value="MXN">MXN</option></NativeSelect></div>
      </div>
      <div className="space-y-2"><Label htmlFor="wo-cost-memo">Memo (optional)</Label><Input id="wo-cost-memo" maxLength={240} placeholder="Replaced the trap and gasket." value={memo} disabled={busy} onChange={(event) => { setMemo(event.target.value); changed(); }} /></div>
      {error ? <Alert variant="destructive"><AlertTitle>Cost update needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {approval ? (
        <Alert variant={approval.approvalStatus === "pending" ? "info" : "success"}>
          <AlertTitle>{approval.approvalStatus === "pending" ? "Owner review requested" : "Owner approval on file"}</AlertTitle>
          <AlertDescription>{approval.approvalStatus === "pending"
            ? "The owners can review this amount in their portal."
            : "This amount is within the approved limit."}</AlertDescription>
        </Alert>
      ) : null}
      {!approvalOnly ? <Button className="w-full" size="lg" disabled={busy || !amount.trim()}>{pending === "post" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}{pending === "post" ? "Posting…" : "Post cost to ledger"}</Button> : null}
      {approvalOnly || approvalRequired ? (
        <Button type="button" variant={approvalOnly ? "default" : "outline"} className="w-full" disabled={busy} onClick={() => void submit("request")}>
          {pending === "request" ? "Requesting…" : "Request owner approval"}
        </Button>
      ) : null}
    </WorkspacePanel>
  </form>;
}
