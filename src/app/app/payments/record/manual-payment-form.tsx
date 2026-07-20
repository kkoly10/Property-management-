"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ManualPaymentOption } from "@/lib/data/finance";

type Result = { paymentId: string; publicReference: string; receiptDocumentId: string; reconciliationStatus: string };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const toMinor = (value: string) => { const number = Number(value); return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };
const localNow = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function ManualPaymentForm({ options, disabled }: { options: ManualPaymentOption[]; disabled: boolean }) {
  const [tenancyId, setTenancyId] = useState(options[0]?.tenancyId ?? "");
  const [source, setSource] = useState("check");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(localNow);
  const [reason, setReason] = useState("");
  const [evidenceDocumentId, setEvidenceDocumentId] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const selected = options.find((option) => option.tenancyId === tenancyId);
  const amountMinor = toMinor(amount);
  const parsedAllocations = Object.entries(allocations).flatMap(([chargeId, value]) => { const amountMinor = toMinor(value); return amountMinor && amountMinor > 0 ? [{ chargeId, amountMinor }] : []; });
  const allocatedMinor = parsedAllocations.reduce((total, allocation) => total + allocation.amountMinor, 0);

  function changed() { idempotencyKey.current = null; setReviewing(false); setResult(null); setError(null); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || disabled) return;
    if (!amountMinor || amountMinor !== allocatedMinor) { setError("Allocate the full payment amount across one or more open charges."); return; }
    if (amountMinor > selected.evidenceThresholdMinor && !evidenceDocumentId) { setError("Select scanned-clean payment evidence before continuing."); return; }
    if (!reviewing) { setReviewing(true); setError(null); return; }
    setPending(true); setError(null); idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/manual-payments", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current }, body: JSON.stringify({ organizationId: selected.organizationId, tenancyId, source, amountMinor, currencyCode: selected.currencyCode, receivedAt: new Date(receivedAt).toISOString(), reason, evidenceDocumentId: evidenceDocumentId || undefined, externalReference: externalReference || undefined, allocations: parsedAllocations }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The payment could not be recorded."); }
      setResult(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The payment could not be recorded."); }
    finally { setPending(false); }
  }

  if (result) return <Card className="border-[#abefc6] bg-[#f6fef9]"><CardHeader><CheckCircle2 className="mb-2 h-10 w-10 text-success" /><CardTitle>Payment recorded</CardTitle><CardDescription>{result.publicReference} posted and allocated atomically. Its reconciliation status is {result.reconciliationStatus}.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><Button asChild><Link href={`/receipts/${result.receiptDocumentId}`}><ReceiptText className="h-4 w-4" />Open receipt</Link></Button><Button asChild variant="outline"><Link href="/app/payments">Return to payments</Link></Button></CardContent></Card>;

  return <form onSubmit={submit} className="space-y-6">
    <Card><CardHeader><CardTitle>Payment details</CardTitle><CardDescription>Use the received date and source shown on the external evidence.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="payment-tenancy">Resident and home</Label><NativeSelect id="payment-tenancy" required value={tenancyId} disabled={disabled || pending} onChange={(event) => { setTenancyId(event.target.value); setAllocations({}); setEvidenceDocumentId(""); changed(); }}><option value="" disabled>Select tenancy</option>{options.map((option) => <option key={option.tenancyId} value={option.tenancyId}>{option.householdName} · {option.propertyName}, Unit {option.unitCode}</option>)}</NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="payment-source">Method</Label><NativeSelect id="payment-source" value={source} onChange={(event) => { setSource(event.target.value); changed(); }}><option value="cash">Cash</option><option value="check">Check</option><option value="external_bank_transfer">External bank transfer</option><option value="other_manual">Other manual</option></NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="payment-amount">Amount ({selected?.currencyCode ?? "currency"})</Label><Input id="payment-amount" required inputMode="decimal" placeholder="850.00" value={amount} onChange={(event) => { setAmount(event.target.value); changed(); }} /></div>
      <div className="space-y-2"><Label htmlFor="received-at">Received at</Label><Input id="received-at" type="datetime-local" required value={receivedAt} onChange={(event) => { setReceivedAt(event.target.value); changed(); }} /></div>
      <div className="space-y-2"><Label htmlFor="external-reference">External reference</Label><Input id="external-reference" maxLength={160} placeholder="Check or transfer reference" value={externalReference} onChange={(event) => { setExternalReference(event.target.value); changed(); }} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="payment-reason">Reason</Label><Input id="payment-reason" required minLength={3} maxLength={1000} placeholder="Where and how the payment was received" value={reason} onChange={(event) => { setReason(event.target.value); changed(); }} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="payment-evidence">Scanned-clean evidence</Label><NativeSelect id="payment-evidence" required={Boolean(amountMinor && selected && amountMinor > selected.evidenceThresholdMinor)} value={evidenceDocumentId} onChange={(event) => { setEvidenceDocumentId(event.target.value); changed(); }}><option value="">Select evidence</option>{selected?.evidenceDocuments.map((document) => <option key={document.documentId} value={document.documentId}>{document.title}</option>)}</NativeSelect><p className="text-xs text-muted-foreground">Evidence is required above {money(selected?.evidenceThresholdMinor ?? 0, selected?.currencyCode ?? "USD")}.</p></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Allocate to charges</CardTitle><CardDescription>The allocation total must exactly equal the payment. Charges lock during posting to prevent double allocation.</CardDescription></CardHeader><CardContent className="space-y-4">{selected?.charges.length ? selected.charges.map((charge) => <div key={charge.chargeId} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_180px] sm:items-end"><div><p className="font-semibold">{charge.description}</p><p className="mt-1 text-sm text-muted-foreground">Due {charge.dueDate} · {money(charge.remainingMinor, selected.currencyCode)} remaining</p></div><div className="space-y-2"><Label htmlFor={`allocation-${charge.chargeId}`}>Apply</Label><Input id={`allocation-${charge.chargeId}`} inputMode="decimal" placeholder="0.00" value={allocations[charge.chargeId] ?? ""} onChange={(event) => { setAllocations((current) => ({ ...current, [charge.chargeId]: event.target.value })); changed(); }} /></div></div>) : <p className="text-sm text-muted-foreground">This tenancy has no open charges.</p>}<div className="flex justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Allocated</span><span className={`font-mono font-semibold ${amountMinor === allocatedMinor && amountMinor ? "text-success" : "text-foreground"}`}>{money(allocatedMinor, selected?.currencyCode ?? "USD")} / {money(amountMinor ?? 0, selected?.currencyCode ?? "USD")}</span></div></CardContent></Card>
    {reviewing ? <Alert variant="warning"><ShieldCheck className="h-5 w-5" /><AlertTitle>Final review</AlertTitle><AlertDescription>This action creates an immutable receipt and balanced journal. It cannot be edited after posting; corrections require a reversal.</AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertTitle>Payment stopped</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Button className="w-full" size="lg" disabled={disabled || pending || !selected?.charges.length}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{pending ? "Recording…" : reviewing ? "Confirm and record payment" : "Review payment"}</Button>
  </form>;
}
