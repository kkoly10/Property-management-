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
const toMinor = (value: string) => { if (!value.trim()) return null; const number = Number(value); return Number.isFinite(number) && number > 0 && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };
const fromMinor = (amountMinor: number | null) => amountMinor !== null ? (amountMinor / 100).toFixed(2) : "";

export function RecordCostForm({ workOrderId, organizationId, defaultCurrencyCode, suggestedAmountMinor, disabled }: {
  workOrderId: string; organizationId: string; defaultCurrencyCode: string | null; suggestedAmountMinor: number | null; disabled: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(fromMinor(suggestedAmountMinor));
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode ?? "USD");
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  function changed() { idempotencyKey.current = null; setError(null); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    const amountMinor = toMinor(amount);
    if (amountMinor === null) { setError("Enter a cost amount greater than zero."); return; }
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/work-orders/${workOrderId}/cost`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, amountMinor, currencyCode, memo: memo.trim() || undefined }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The cost could not be recorded."); }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The cost could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: result.currencyCode }).format(result.amountMinor / 100);
    return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Cost posted to the ledger</AlertTitle><AlertDescription>{formatted} recorded as a repairs expense.</AlertDescription></Alert>;
  }

  return <form onSubmit={submit} className="space-y-5">
    <WorkspacePanel
      title="Record maintenance cost"
      description="Post the vendor cost to the ledger. It debits repairs & maintenance, credits accounts payable, and flows onto the owner statement."
      bodyClassName="space-y-4 p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="wo-cost-amount">Cost amount</Label><Input id="wo-cost-amount" inputMode="decimal" required placeholder="0.00" value={amount} disabled={disabled || pending} onChange={(event) => { setAmount(event.target.value); changed(); }} /></div>
        <div className="space-y-2"><Label htmlFor="wo-cost-currency">Currency</Label><NativeSelect id="wo-cost-currency" value={currencyCode} disabled={disabled || pending} onChange={(event) => { setCurrencyCode(event.target.value); changed(); }}><option value="USD">USD</option><option value="CAD">CAD</option><option value="MXN">MXN</option></NativeSelect></div>
      </div>
      <div className="space-y-2"><Label htmlFor="wo-cost-memo">Memo (optional)</Label><Input id="wo-cost-memo" maxLength={240} placeholder="Replaced the trap and gasket." value={memo} disabled={disabled || pending} onChange={(event) => { setMemo(event.target.value); changed(); }} /></div>
      {error ? <Alert variant="destructive"><AlertTitle>Cost not recorded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button className="w-full" size="lg" disabled={disabled || pending || !amount.trim()}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}{pending ? "Posting…" : "Post cost to ledger"}</Button>
    </WorkspacePanel>
  </form>;
}
