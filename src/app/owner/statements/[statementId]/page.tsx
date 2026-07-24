import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, FileLock2, ReceiptText, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getOwnerStatementDetail } from "@/lib/data/owner-statements";

export const dynamic = "force-dynamic";
const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

export default async function OwnerStatementDetailPage({ params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const detail = await getOwnerStatementDetail(statementId);
  if (detail.mode === "ready" && !detail.item) notFound();
  const item = detail.item;
  return <div className="min-h-screen bg-[#f6f8fb] pb-12">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Owner</Badge></div></header>
    <main className="mx-auto max-w-5xl space-y-6 p-5 sm:py-8">
      <Button asChild variant="ghost" size="sm"><Link href="/owner"><ArrowLeft className="h-4 w-4" />Owner workspace</Link></Button>
      {detail.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Statement preview</AlertTitle><AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription></Alert> : null}
      {detail.mode === "error" || !item ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Statement unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription></Alert> : <>
        <div><div className="flex flex-wrap items-center gap-2"><Badge variant="success">Finalized · v{item.versionNumber}</Badge>{item.correctionReason ? <Badge variant="warning">Corrected statement</Badge> : null}</div><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">{item.snapshot.propertyName}</h1><p className="mt-2 text-sm text-muted-foreground">{item.snapshot.ownerName} · {new Date(`${item.snapshot.periodStart}T00:00:00`).toLocaleDateString()} – {new Date(`${item.snapshot.periodEnd}T00:00:00`).toLocaleDateString()}</p></div>
        {item.correctionReason ? <Alert variant="info"><AlertTitle>Correction reason</AlertTitle><AlertDescription>{item.correctionReason}</AlertDescription></Alert> : null}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Statement totals"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Income</p><p className="mt-2 font-mono text-lg font-semibold">{money(item.snapshot.incomeMinor, item.snapshot.currencyCode)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expenses</p><p className="mt-2 font-mono text-lg font-semibold">{money(item.snapshot.expenseMinor, item.snapshot.currencyCode)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Management fees</p><p className="mt-2 font-mono text-lg font-semibold">{money(item.snapshot.managementFeeMinor, item.snapshot.currencyCode)}</p></CardContent></Card><Card className="border-primary/30 bg-primary/5"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net owner position</p><p className="mt-2 font-mono text-lg font-semibold">{money(item.snapshot.netOwnerPositionMinor, item.snapshot.currencyCode)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Current owner payable</p><p className="mt-2 font-mono text-lg font-semibold">{money(item.ownerPayableMinor, item.snapshot.currencyCode)}</p></CardContent></Card></section>
        <Card><CardHeader><CardTitle>Account summary</CardTitle><CardDescription>Sanitized owner allocation from {item.snapshot.sourceTransactionCount} posted transactions. Resident and payment details are not included.</CardDescription></CardHeader><CardContent className="p-0"><div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 border-y bg-muted/50 px-5 py-2 text-xs font-semibold text-muted-foreground"><span>Account</span><span>Description</span><span>Owner amount</span></div>{item.snapshot.lines.map((line) => <div key={line.accountCode} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 border-b px-5 py-4 text-sm last:border-0"><span className="font-mono text-xs">{line.accountCode}</span><span>{line.accountName}<span className="ml-2 text-xs text-muted-foreground">{line.transactionCount} {line.transactionCount === 1 ? "transaction" : "transactions"}</span></span><span className="font-mono font-medium">{money(line.amountMinor, item.snapshot.currencyCode)}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recorded remittances</CardTitle><CardDescription>Evidence-backed payments recorded by your operator outside Crecy for this statement series.</CardDescription></CardHeader><CardContent className="p-0">{item.remittances.length ? <div className="divide-y">{item.remittances.map((remittance) => <div key={remittance.remittanceId} className="flex items-center justify-between gap-4 p-5"><div><p className="flex items-center gap-2 font-medium"><ReceiptText className="h-4 w-4 text-muted-foreground" />{remittance.publicReference}</p><p className="mt-1 text-xs text-muted-foreground">Paid {new Date(`${remittance.paidOn}T00:00:00`).toLocaleDateString()}{remittance.externalReference ? ` · ${remittance.externalReference}` : ""}</p></div><span className="font-mono font-semibold">{money(remittance.amountMinor, remittance.currencyCode)}</span></div>)}</div> : <p className="p-5 text-sm text-muted-foreground">No remittance has been recorded for this statement series.</p>}</CardContent></Card>
        <Alert variant="info"><FileLock2 className="h-5 w-5" /><AlertTitle>Immutable snapshot</AlertTitle><AlertDescription>Finalized {new Date(item.finalizedAt).toLocaleString()}. Integrity hash <span className="font-mono">{item.sha256Hex.slice(0, 16)}…</span></AlertDescription></Alert>
      </>}
    </main>
  </div>;
}
