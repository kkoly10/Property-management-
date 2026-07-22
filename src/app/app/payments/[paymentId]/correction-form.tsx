"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { PaymentDetail } from "@/lib/data/finance";

type CorrectionType = "return" | "reversal" | "allocation_correction" | "metadata_correction";
type Result = { paymentId: string; correctionType: CorrectionType; paymentStatus: string; version: number; correctiveJournalTransactionId: string | null; correctedAt: string };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const toMinor = (value: string) => { const number = Number(value); return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };

export function CorrectionForm({ payment, disabled }: { payment: PaymentDetail; disabled: boolean }) {
  const router = useRouter();
  const [correctionType, setCorrectionType] = useState<CorrectionType>("reversal");
  const [reason, setReason] = useState("");
  const [manualReason, setManualReason] = useState(payment.reason);
  const [externalReference, setExternalReference] = useState(payment.externalReference ?? "");
  const [allocations, setAllocations] = useState<Record<string, string>>(() => Object.fromEntries(payment.allocations.filter(({ reversedAt }) => !reversedAt).map(({ chargeId, amountMinor }) => [chargeId, (amountMinor / 100).toFixed(2)])));
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const replacementAllocations = Object.entries(allocations).flatMap(([chargeId, value]) => { const amountMinor = toMinor(value); return amountMinor && amountMinor > 0 ? [{ chargeId, amountMinor }] : []; });
  const allocatedMinor = replacementAllocations.reduce((total, allocation) => total + allocation.amountMinor, 0);

  function changed() { idempotencyKey.current = null; setReviewing(false); setResult(null); setError(null); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !payment.canCorrect) return;
    if (correctionType === "allocation_correction" && allocatedMinor !== payment.amountMinor) { setError("Replacement allocations must equal the full payment amount."); return; }
    if (!reviewing) { setReviewing(true); setError(null); return; }
    setPending(true); setError(null); idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/payments/${payment.paymentId}/corrections`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ correctionType, reason, expectedStatus: payment.status, expectedVersion: payment.version,
          replacementAllocations: correctionType === "allocation_correction" ? replacementAllocations : undefined,
          metadataCorrection: correctionType === "metadata_correction" ? { manualReason, externalReference } : undefined }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The correction could not be posted."); }
      setResult(body); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The correction could not be posted."); }
    finally { setPending(false); }
  }

  if (result) return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Correction posted</AlertTitle><AlertDescription>{result.correctionType.replaceAll("_", " ")} advanced this payment to version {result.version}. {result.correctiveJournalTransactionId ? "A balanced corrective journal was posted." : "No economic journal was needed."}</AlertDescription></Alert>;

  return <form onSubmit={submit} className="space-y-5">
    <Card><CardHeader><CardTitle>Create correction</CardTitle><CardDescription>Corrections preserve the original payment and create a complete audit trail.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="correction-type">Correction type</Label><NativeSelect id="correction-type" value={correctionType} disabled={disabled || pending} onChange={(event) => { setCorrectionType(event.target.value as CorrectionType); changed(); }}><option value="reversal">Reverse mistaken manual payment</option><option value="return">Record returned external payment</option><option value="allocation_correction">Replace charge allocations</option><option value="metadata_correction">Correct reference or note</option></NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="correction-reason">Why is this correction required?</Label><Input id="correction-reason" required minLength={3} maxLength={1000} placeholder="Specific operational reason" value={reason} disabled={disabled || pending} onChange={(event) => { setReason(event.target.value); changed(); }} /></div>
      {correctionType === "metadata_correction" ? <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="corrected-note">Corrected payment note</Label><Input id="corrected-note" required minLength={3} maxLength={1000} value={manualReason} onChange={(event) => { setManualReason(event.target.value); changed(); }} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="corrected-reference">Corrected external reference</Label><Input id="corrected-reference" maxLength={160} value={externalReference} onChange={(event) => { setExternalReference(event.target.value); changed(); }} /></div></div> : null}
      {correctionType === "allocation_correction" ? <div className="space-y-3 rounded-lg border p-4"><div><p className="font-semibold">Replacement allocations</p><p className="mt-1 text-sm text-muted-foreground">The prior allocation rows remain in history and are marked reversed.</p></div>{payment.eligibleCharges.map((charge) => <div key={charge.chargeId} className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_180px] sm:items-end"><div><p className="font-medium">{charge.description}</p><p className="text-xs text-muted-foreground">Due {charge.dueDate} · {money(charge.availableMinor, payment.currencyCode)} available</p></div><div className="space-y-2"><Label htmlFor={`replacement-${charge.chargeId}`}>Apply</Label><Input id={`replacement-${charge.chargeId}`} inputMode="decimal" value={allocations[charge.chargeId] ?? ""} onChange={(event) => { setAllocations((current) => ({ ...current, [charge.chargeId]: event.target.value })); changed(); }} /></div></div>)}<div className="flex justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">Replacement total</span><span className="font-mono font-semibold">{money(allocatedMinor, payment.currencyCode)} / {money(payment.amountMinor, payment.currencyCode)}</span></div></div> : null}
      {reviewing ? <Alert variant="warning"><ShieldCheck className="h-5 w-5" /><AlertTitle>Final confirmation</AlertTitle><AlertDescription>{correctionType === "metadata_correction" ? "This records the old and corrected metadata in the audit trail." : correctionType === "allocation_correction" ? "This reverses the active allocations, adds replacements, and posts a balanced control journal." : "This reopens the receivable, reverses active allocations, and posts a balanced reversal journal."}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Correction stopped</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button className="w-full" size="lg" disabled={disabled || pending || !payment.canCorrect}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{pending ? "Posting correction…" : reviewing ? "Confirm and post correction" : "Review correction"}</Button>
    </CardContent></Card>
  </form>;
}
