"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, ReceiptText, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { OperatorOwnerStatementContext } from "@/lib/data/owner-statements";

const money = (amountMinor: number, currency: string) => new Intl.NumberFormat(
  "en-US",
  { style: "currency", currency },
).format(amountMinor / 100);

function parseMoneyToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function OwnerRemittanceForm({
  owner,
  disabled,
}: {
  owner: OperatorOwnerStatementContext;
  disabled: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [externalReference, setExternalReference] = useState("");
  const [evidenceDocumentId, setEvidenceDocumentId] = useState(owner.evidenceDocuments[0]?.documentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ reference: string; amountMinor: number } | null>(null);
  const latest = owner.latestStatement;
  const amountMinor = parseMoneyToMinor(amount);
  const unavailable = disabled || !latest || latest.availableToRemitMinor <= 0 || owner.evidenceDocuments.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!latest || amountMinor === null) {
      setError("Enter a positive amount with no more than two decimal places.");
      return;
    }
    if (amountMinor > latest.availableToRemitMinor) {
      setError(`The maximum available amount is ${money(latest.availableToRemitMinor, owner.currencyCode)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/v1/owner-remittances", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          organizationId: owner.organizationId,
          ownerEntityId: owner.ownerEntityId,
          propertyId: owner.propertyId,
          statementSnapshotId: latest.statementSnapshotId,
          amountMinor,
          currencyCode: owner.currencyCode,
          paidOn,
          externalReference: externalReference.trim(),
          evidenceDocumentId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The remittance could not be recorded.");
      } else {
        setSuccess({ reference: String(body.publicReference), amountMinor: Number(body.amountMinor) });
        setAmount("");
        setExternalReference("");
        router.refresh();
      }
    } catch {
      setError("The remittance response was interrupted. Check the history before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return <Card>
    <CardHeader>
      <CardTitle>Record an external remittance</CardTitle>
      <CardDescription>Reconcile funds the operator already paid to this owner. Crecy records the accounting evidence; it does not transmit money.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Owner payable</p><p className="mt-1 font-mono font-semibold">{money(owner.ownerPayableMinor, owner.currencyCode)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Latest statement</p><p className="mt-1 font-mono font-semibold">{latest ? `v${latest.versionNumber}` : "None"}</p></div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Available to record</p><p className="mt-1 font-mono font-semibold">{money(latest?.availableToRemitMinor ?? 0, owner.currencyCode)}</p></div>
      </div>
      {!latest ? <Alert variant="info"><ShieldAlert className="h-5 w-5" /><AlertTitle>Finalize a statement first</AlertTitle><AlertDescription>A remittance can be linked after an immutable statement exists.</AlertDescription></Alert> : null}
      {latest && owner.evidenceDocuments.length === 0 ? <Alert variant="warning"><ShieldAlert className="h-5 w-5" /><AlertTitle>Evidence required</AlertTitle><AlertDescription>Upload a scanned-clean document with type “owner remittance evidence” before recording funds.</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Remittance not recorded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertTitle>External remittance recorded</AlertTitle><AlertDescription>{money(success.amountMinor, owner.currencyCode)} was reconciled under {success.reference}.</AlertDescription></Alert> : null}
      <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="remittance-amount">Amount ({owner.currencyCode})</Label><Input id="remittance-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={unavailable || busy} /></div>
        <div className="space-y-2"><Label htmlFor="remittance-paid-on">Paid date</Label><Input id="remittance-paid-on" type="date" max={new Date().toISOString().slice(0, 10)} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} required disabled={unavailable || busy} /></div>
        <div className="space-y-2"><Label htmlFor="remittance-reference">External reference</Label><Input id="remittance-reference" value={externalReference} onChange={(event) => setExternalReference(event.target.value)} maxLength={200} placeholder="ACH or check reference" disabled={unavailable || busy} /></div>
        <div className="space-y-2"><Label htmlFor="remittance-evidence">Payment evidence</Label><NativeSelect id="remittance-evidence" value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)} required disabled={unavailable || busy}>{owner.evidenceDocuments.map((document) => <option key={document.documentId} value={document.documentId}>{document.title} · {document.originalFilename}</option>)}</NativeSelect></div>
        <Button className="md:col-span-2" type="submit" disabled={unavailable || busy || amountMinor === null || amountMinor > (latest?.availableToRemitMinor ?? 0)}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}Record funds paid outside Crecy</Button>
      </form>
      {owner.remittances.length ? <div className="overflow-hidden rounded-lg border"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground"><span>Recent remittance</span><span>Amount</span></div>{owner.remittances.slice(0, 5).map((remittance) => <div key={remittance.remittanceId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-4 py-3 text-sm last:border-0"><div><p className="font-medium">{remittance.publicReference}</p><p className="mt-1 text-xs text-muted-foreground">Paid {new Date(`${remittance.paidOn}T00:00:00`).toLocaleDateString()}{remittance.externalReference ? ` · ${remittance.externalReference}` : ""}</p></div><span className="font-mono font-medium">{money(remittance.amountMinor, remittance.currencyCode)}</span></div>)}</div> : null}
    </CardContent>
  </Card>;
}
