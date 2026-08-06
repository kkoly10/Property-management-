"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Ban } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ManualPaymentOption } from "@/lib/data/finance";

type Result = { writtenOffMinor: number; chargeCount: number; currencyCode: string };

export function WriteOffChargesForm({ option, disabled }: { option: ManualPaymentOption; disabled: boolean }) {
  const router = useRouter();
  const money = useMemo(() => (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: option.currencyCode }).format(amount / 100), [option.currencyCode]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const chargeIds = option.charges.filter((charge) => selected[charge.chargeId]).map((charge) => charge.chargeId);
  const selectedTotal = option.charges.filter((charge) => selected[charge.chargeId]).reduce((total, charge) => total + charge.remainingMinor, 0);

  function changed() { idempotencyKey.current = null; setError(null); }
  function toggle(chargeId: string) { setSelected((current) => ({ ...current, [chargeId]: !current[chargeId] })); changed(); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending || !chargeIds.length || reason.trim().length < 3) return;
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/receivable-write-offs", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId: option.organizationId, tenancyId: option.tenancyId, chargeIds, reason: reason.trim() }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The receivable could not be written off."); }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The receivable could not be written off.");
    } finally {
      setPending(false);
    }
  }

  if (result) return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Wrote off {money(result.writtenOffMinor)}</AlertTitle><AlertDescription>{result.chargeCount} charge{result.chargeCount === 1 ? "" : "s"} recognized as uncollectible.</AlertDescription></Alert>;
  if (!option.charges.length) return null;

  if (!open) return <Button variant="ghost" size="sm" className="text-destructive" disabled={disabled} onClick={() => setOpen(true)}><Ban className="h-4 w-4" />Write off uncollectible</Button>;

  return <form onSubmit={submit} className="space-y-3 rounded-lg border border-destructive/40 p-4">
    <p className="text-sm font-semibold">Write off uncollectible charges</p>
    <div className="space-y-2">{option.charges.map((charge) => <label key={charge.chargeId} className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2"><input type="checkbox" checked={Boolean(selected[charge.chargeId])} disabled={disabled || pending} onChange={() => toggle(charge.chargeId)} />{charge.description} <span className="text-xs text-muted-foreground">due {charge.dueDate}</span></span>
      <span className="font-mono">{money(charge.remainingMinor)}</span>
    </label>)}</div>
    <div className="space-y-2"><Label htmlFor={`writeoff-reason-${option.tenancyId}`}>Reason</Label><Textarea id={`writeoff-reason-${option.tenancyId}`} rows={2} required minLength={3} maxLength={1000} placeholder="Tenant moved out; the remaining balance is uncollectible." value={reason} disabled={disabled || pending} onChange={(event) => { setReason(event.target.value); changed(); }} /></div>
    {error ? <Alert variant="destructive"><AlertTitle>Not written off</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{chargeIds.length ? `Writing off ${money(selectedTotal)}` : "Select at least one charge"}</span>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" size="sm" disabled={disabled || pending || !chargeIds.length || reason.trim().length < 3}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}Write off</Button>
      </div>
    </div>
  </form>;
}
