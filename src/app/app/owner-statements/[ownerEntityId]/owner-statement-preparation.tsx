"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Calculator, CheckCircle2, FileLock2, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OperatorOwnerStatementContext, OwnerStatementLine } from "@/lib/data/owner-statements";
import { OwnerRemittanceForm } from "./owner-remittance-form";

type Draft = {
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  incomeMinor: number;
  expenseMinor: number;
  managementFeeMinor: number;
  netOwnerPositionMinor: number;
  sourceEntryCount: number;
  sourceTransactionCount: number;
  ledgerCutoffPostedAt: string | null;
  lines: OwnerStatementLine[];
  sha256Hex: string;
};

const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

export function OwnerStatementPreparation({
  owner,
  defaultPeriodStart,
  defaultPeriodEnd,
  disabled,
}: {
  owner: OperatorOwnerStatementContext;
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [busy, setBusy] = useState<"calculate" | "finalize" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; version: number } | null>(null);
  const [finalizationKey, setFinalizationKey] = useState("");

  const context = {
    organizationId: owner.organizationId,
    accountingBookId: owner.accountingBookId,
    ownerEntityId: owner.ownerEntityId,
    propertyId: owner.propertyId,
    periodStart,
    periodEnd,
  };
  const correction = owner.latestStatement?.periodStart === periodStart && owner.latestStatement.periodEnd === periodEnd;

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setBusy("calculate");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/v1/owner-statements/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(context),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDraft(null);
        setError(body.error ?? "The statement could not be calculated.");
      } else {
        setDraft(body as Draft);
        setFinalizationKey(crypto.randomUUID());
      }
    } catch {
      setDraft(null);
      setError("The statement service could not be reached. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function finalize() {
    if (!draft) return;
    setBusy("finalize");
    setError(null);
    try {
      const response = await fetch("/api/v1/owner-statements/finalize", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": finalizationKey },
        body: JSON.stringify({
          ...context,
          expectedCalculationHash: draft.sha256Hex,
          correctionReason: correction ? correctionReason : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The statement could not be finalized.");
      } else {
        setSuccess({ id: String(body.statementSnapshotId), version: Number(body.versionNumber) });
        router.refresh();
      }
    } catch {
      setError("The finalization response was interrupted. Retry to safely recover the same result.");
    } finally {
      setBusy(null);
    }
  }

  return <>
    <div><p className="text-sm text-muted-foreground">Statement preparation</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">{owner.ownerName}</h1><p className="mt-2 text-sm text-muted-foreground">{owner.propertyName} · {owner.currencyCode} accounting book</p></div>
    {error ? <Alert variant="destructive"><AlertTitle>Statement not ready</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {success ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Statement finalized</AlertTitle><AlertDescription>Immutable version {success.version} was created with reference {success.id}.</AlertDescription></Alert> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,.7fr)_minmax(0,1.3fr)]">
      <Card><CardHeader><CardTitle>Ledger period</CardTitle><CardDescription>Only posted entries inside this inclusive period are used.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={calculate}><div className="space-y-2"><Label htmlFor="period-start">Period start</Label><Input id="period-start" type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setDraft(null); }} required disabled={disabled || busy !== null} /></div><div className="space-y-2"><Label htmlFor="period-end">Period end</Label><Input id="period-end" type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setDraft(null); }} required disabled={disabled || busy !== null} /></div><Button className="w-full" type="submit" disabled={disabled || busy !== null}>{busy === "calculate" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}Recalculate</Button></form>{owner.latestStatement ? <div className="mt-5 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground"><p>Latest finalized period: {owner.latestStatement.periodStart} – {owner.latestStatement.periodEnd}</p><p className="mt-1">Version {owner.latestStatement.versionNumber} · {money(owner.latestStatement.netOwnerPositionMinor, owner.currencyCode)}</p></div> : null}</CardContent></Card>
      <Card><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Calculated statement</CardTitle><CardDescription>Review the totals and account-level source drill-down before finalizing.</CardDescription></div>{draft ? <Badge variant="success">Hash verified</Badge> : null}</div></CardHeader><CardContent className="p-5">{draft ? <div className="space-y-6"><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Statement totals"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Income</p><p className="mt-1 font-mono font-semibold">{money(draft.incomeMinor, draft.currencyCode)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Expenses</p><p className="mt-1 font-mono font-semibold">{money(draft.expenseMinor, draft.currencyCode)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Management fees</p><p className="mt-1 font-mono font-semibold">{money(draft.managementFeeMinor, draft.currencyCode)}</p></div><div className="rounded-lg border border-primary/30 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Net owner position</p><p className="mt-1 font-mono font-semibold">{money(draft.netOwnerPositionMinor, draft.currencyCode)}</p></div></section><div className="overflow-hidden rounded-lg border"><div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground"><span>Account</span><span>Description</span><span>Owner amount</span></div>{draft.lines.length ? draft.lines.map((line) => <div key={line.accountCode} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 border-b px-4 py-3 text-sm last:border-0"><span className="font-mono text-xs">{line.accountCode}</span><span>{line.accountName}<span className="ml-2 text-xs text-muted-foreground">{line.transactionCount} {line.transactionCount === 1 ? "transaction" : "transactions"}</span></span><span className="font-mono font-medium">{money(line.amountMinor, draft.currencyCode)}</span></div>) : <p className="p-5 text-sm text-muted-foreground">No revenue or expense lines were posted in this period.</p>}</div><div className="text-xs text-muted-foreground"><p>{draft.sourceEntryCount} source entries across {draft.sourceTransactionCount} posted transactions.</p><p className="mt-1 truncate font-mono">SHA-256 {draft.sha256Hex}</p></div>{correction ? <div className="space-y-2"><Label htmlFor="correction-reason">Correction reason</Label><Textarea id="correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain the ledger change that requires a new statement version." minLength={3} maxLength={500} required /></div> : null}<Alert variant="info"><FileLock2 className="h-5 w-5" /><AlertTitle>Finalization is permanent</AlertTitle><AlertDescription>The snapshot cannot be edited. A later ledger change requires a new corrective version.</AlertDescription></Alert><Button className="w-full" onClick={finalize} disabled={disabled || busy !== null || (correction && correctionReason.trim().length < 3)}>{busy === "finalize" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileLock2 className="h-4 w-4" />}Finalize immutable snapshot</Button></div> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><Calculator className="h-10 w-10 text-muted-foreground/50" /><p className="mt-4 font-medium">Choose a period and calculate</p><p className="mt-2 max-w-sm text-sm text-muted-foreground">The draft hash will change if any posted ledger entry or effective ownership allocation changes.</p></div>}</CardContent></Card>
    </div>
    <OwnerRemittanceForm owner={owner} disabled={disabled} />
  </>;
}
