import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, FileClock, Landmark, ReceiptText, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPaymentDetail } from "@/lib/data/finance";
import { CorrectionForm } from "./correction-form";

export const dynamic = "force-dynamic";
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const label = (value: string) => value.replaceAll("_", " ");
const badgeVariant = (status: string) => status === "succeeded" ? "success" as const : status === "returned" || status === "reversed" || status === "refunded" ? "warning" as const : "neutral" as const;

export default async function PaymentDetailPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const result = await getPaymentDetail(paymentId);
  if (result.mode === "not_found") notFound();
  if (!result.payment) return <div className="mx-auto max-w-4xl space-y-6"><Button asChild variant="ghost" size="sm"><Link href="/app/payments"><ArrowLeft className="h-4 w-4" />Payments</Link></Button><Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Payment unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {result.requestId}.</AlertDescription></Alert></div>;
  const payment = result.payment;
  const activeAllocations = payment.allocations.filter(({ reversedAt }) => !reversedAt);

  return <div className="mx-auto max-w-6xl space-y-6">
    <Button asChild variant="ghost" size="sm"><Link href="/app/payments"><ArrowLeft className="h-4 w-4" />Payments</Link></Button>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">Payment detail</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{payment.publicReference}</h1><p className="mt-2 text-sm text-muted-foreground">{payment.householdName} · {payment.propertyName}, Unit {payment.unitCode}</p></div><div className="flex flex-wrap gap-2"><Badge variant={badgeVariant(payment.status)}>{label(payment.status)}</Badge><Badge variant="warning">{label(payment.reconciliationStatus ?? "unreconciled")}</Badge><Badge variant="neutral">version {payment.version}</Badge></div></div>
    {result.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Correction preview</AlertTitle><AlertDescription>The detail and review controls use sample data until Supabase is connected; submission is disabled.</AlertDescription></Alert> : null}
    {payment.status !== "succeeded" ? <Alert variant="warning"><RotateCcw className="h-5 w-5" /><AlertTitle>This payment was {label(payment.status)}</AlertTitle><AlertDescription>The original receipt and journal remain available as historical records. Active allocations and the resident balance reflect the correction.</AlertDescription></Alert> : null}
    <section aria-label="Payment summary" className="grid gap-4 sm:grid-cols-3">
      <Card><CardContent className="p-5"><Landmark className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Amount</p><p className="mt-2 font-mono text-2xl font-semibold">{money(payment.amountMinor, payment.currencyCode)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><ReceiptText className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Received</p><p className="mt-2 font-semibold">{new Date(payment.receivedAt).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{label(payment.source)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><FileClock className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Active allocation</p><p className="mt-2 font-mono text-2xl font-semibold">{money(activeAllocations.reduce((sum, item) => sum + item.amountMinor, 0), payment.currencyCode)}</p></CardContent></Card>
    </section>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <div className="space-y-6">
        <Card><CardHeader className="border-b"><CardTitle>Canonical record</CardTitle><CardDescription>The posted journal is immutable; payment metadata changes remain audited.</CardDescription></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment note</p><p className="mt-2 text-sm">{payment.reason}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">External reference</p><p className="mt-2 font-mono text-sm">{payment.externalReference ?? "None"}</p></div><div className="sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Original journal</p><p className="mt-2 break-all font-mono text-xs">{payment.journalTransactionId}</p></div><div className="sm:col-span-2"><Button asChild variant="outline"><Link href={`/receipts/${payment.receiptDocumentId}`}><ReceiptText className="h-4 w-4" />View historical receipt</Link></Button></div></CardContent></Card>
        <Card><CardHeader className="border-b"><CardTitle>Allocation history</CardTitle><CardDescription>Reversed rows are retained; only unreversed rows affect charge status.</CardDescription></CardHeader><CardContent className="p-0">{payment.allocations.length ? <div className="divide-y">{payment.allocations.map((allocation) => <div key={allocation.allocationId} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{allocation.description}</p><p className="mt-1 text-xs text-muted-foreground">Due {allocation.dueDate} · allocated {new Date(allocation.allocatedAt).toLocaleString()}</p>{allocation.reversalReason ? <p className="mt-1 text-xs text-warning">{allocation.reversalReason}</p> : null}</div><div className="text-left sm:text-right"><p className="font-mono font-semibold">{money(allocation.amountMinor, payment.currencyCode)}</p><Badge className="mt-1" variant={allocation.reversedAt ? "warning" : "success"}>{allocation.reversedAt ? "reversed" : "active"}</Badge></div></div>)}</div> : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No allocation rows.</p>}</CardContent></Card>
        <Card><CardHeader className="border-b"><CardTitle>Correction timeline</CardTitle><CardDescription>Each event is written with audit and outbox records in the financial transaction.</CardDescription></CardHeader><CardContent className="p-0">{payment.corrections.length ? <div className="divide-y">{payment.corrections.map((correction) => <div key={correction.correctionId} className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize">{label(correction.correctionType)}</p><Badge variant={badgeVariant(correction.paymentStatus)}>version {correction.version}</Badge></div><p className="mt-2 text-sm">{correction.reason}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(correction.correctedAt).toLocaleString()}{correction.correctiveJournalTransactionId ? ` · journal ${correction.correctiveJournalTransactionId}` : " · no economic journal"}</p></div>)}</div> : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No corrections have been posted.</p>}</CardContent></Card>
      </div>
      <aside><CorrectionForm payment={payment} disabled={result.mode !== "ready"} /></aside>
    </div>
  </div>;
}
