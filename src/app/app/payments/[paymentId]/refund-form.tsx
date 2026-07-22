"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentDetail } from "@/lib/data/finance";

type RefundResult = {
  paymentId: string;
  refundId: string;
  refundStatus: "pending" | "succeeded";
  paymentStatus: string;
  correctiveJournalTransactionId: string | null;
};

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const toMinor = (value: string) => {
  const amount = Number(value);
  const minor = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(minor) ? minor : null;
};

export function RefundForm({ payment, disabled }: { payment: PaymentDetail; disabled: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState((payment.refundableMinor / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefundResult | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  function changed() {
    idempotencyKey.current = null;
    setReviewing(false);
    setResult(null);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = toMinor(amount);
    if (disabled || !payment.canRefund) return;
    if (!amountMinor || amountMinor<1 || amountMinor>payment.refundableMinor) {
      setError(`Enter an amount up to ${money(payment.refundableMinor, payment.currencyCode)}.`);
      return;
    }
    if (!reviewing) { setReviewing(true); setError(null); return; }

    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/payments/${payment.paymentId}/refunds`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          amountMinor,
          reason,
          expectedStatus: payment.status,
          expectedVersion: payment.version,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const body = await response.json() as RefundResult & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The refund could not be completed."); }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The refund could not be completed.");
    } finally {
      setPending(false);
    }
  }

  if (result) return <Alert variant={result.refundStatus === "succeeded" ? "default" : "warning"} className={result.refundStatus === "succeeded" ? "border-[#abefc6] bg-[#ecfdf3] text-success" : undefined}><CheckCircle2 className="h-5 w-5" /><AlertTitle>{result.refundStatus === "succeeded" ? "Refund completed" : "Refund pending"}</AlertTitle><AlertDescription>{result.refundStatus === "succeeded" ? "Stripe confirmed the refund and Crecy posted the corrective journal." : "Stripe accepted the refund. The receivable will reopen only after a signed success event."}</AlertDescription></Alert>;

  return <form onSubmit={submit} className="space-y-5">
    <Card><CardHeader><CardTitle>Refund provider payment</CardTitle><CardDescription>Refunds return funds through the connected Stripe account and preserve the original journal.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Refundable balance</p><p className="mt-1 font-mono text-2xl font-semibold">{money(payment.refundableMinor, payment.currencyCode)}</p></div>
      <div className="space-y-2"><Label htmlFor="refund-amount">Refund amount</Label><Input id="refund-amount" required inputMode="decimal" value={amount} disabled={disabled || pending || !payment.canRefund} onChange={(event) => { setAmount(event.target.value); changed(); }} /></div>
      <div className="space-y-2"><Label htmlFor="refund-reason">Reason</Label><Input id="refund-reason" required minLength={3} maxLength={1000} placeholder="Why funds are being returned" value={reason} disabled={disabled || pending || !payment.canRefund} onChange={(event) => { setReason(event.target.value); changed(); }} /></div>
      {reviewing ? <Alert variant="warning"><ShieldCheck className="h-5 w-5" /><AlertTitle>Final confirmation</AlertTitle><AlertDescription>This sends {money(toMinor(amount) ?? 0, payment.currencyCode)} through Stripe. Crecy posts a corrective journal and reopens the corresponding receivable only after provider success.</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Refund stopped</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {!payment.canRefund ? <Alert variant="info"><AlertTitle>No refund available</AlertTitle><AlertDescription>This payment has no remaining provider amount eligible for refund.</AlertDescription></Alert> : null}
      <Button className="w-full" size="lg" disabled={disabled || pending || !payment.canRefund}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{pending ? "Sending refund…" : reviewing ? "Confirm refund" : "Review refund"}</Button>
    </CardContent></Card>
  </form>;
}
