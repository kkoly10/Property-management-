import Link from "next/link";
import { ArrowRight, CircleAlert, Landmark, Plus, ReceiptText, WalletCards } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorPaymentWorkspace, type ReceivableSummaryItem } from "@/lib/data/finance";

export const dynamic = "force-dynamic";
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const sourceLabel = (source: string) => ({ cash: "Cash", check: "Check", external_bank_transfer: "Bank transfer", other_manual: "Other" }[source] ?? source);
function totals(items: ReceivableSummaryItem[]) { return items.reduce<Record<string, number>>((result, item) => ({ ...result, [item.currencyCode]: (result[item.currencyCode] ?? 0) + item.balanceMinor }), {}); }

export default async function PaymentsPage() {
  const workspace = await getOperatorPaymentWorkspace();
  const outstanding = totals(workspace.items);
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">Finance operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Payments</h1><p className="mt-2 text-sm text-muted-foreground">Journal-derived balances, controlled manual receipts, and reconciliation state.</p></div><Button asChild><Link href="/app/payments/record"><Plus className="h-4 w-4" />Record payment</Link></Button></div>
    {workspace.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Finance preview</AlertTitle><AlertDescription>Sample data demonstrates the complete payment workflow until Supabase is connected.</AlertDescription></Alert> : null}
    {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Payments unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
    <section aria-label="Payment summary" className="grid gap-4 sm:grid-cols-3">
      <Card><CardContent className="p-5"><Landmark className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Outstanding</p>{Object.entries(outstanding).map(([currency, amount]) => <p key={currency} className="mt-2 font-mono text-xl font-semibold">{money(amount, currency)}</p>)}</CardContent></Card>
      <Card><CardContent className="p-5"><ReceiptText className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Recorded payments</p><p className="mt-2 text-2xl font-semibold">{workspace.payments.length}</p></CardContent></Card>
      <Card><CardContent className="p-5"><CircleAlert className="h-5 w-5 text-warning" /><p className="mt-4 text-sm text-muted-foreground">Unreconciled</p><p className="mt-2 text-2xl font-semibold">{workspace.payments.filter((payment) => payment.reconciliationStatus === "unreconciled").length}</p></CardContent></Card>
    </section>
    <Card><CardHeader className="border-b"><CardTitle>Recent payments</CardTitle><CardDescription>Successful receipts are immutable; reconciliation remains a separate control.</CardDescription></CardHeader><CardContent className="p-0">{workspace.payments.length ? <div className="divide-y">{workspace.payments.map((payment) => <div key={payment.paymentId} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,.8fr)_auto] lg:items-center"><div><p className="font-semibold">{payment.householdName}</p><p className="mt-1 text-sm text-muted-foreground">{payment.propertyName} · Unit {payment.unitCode} · {payment.publicReference}</p></div><div><p className="font-mono font-semibold">{money(payment.amountMinor, payment.currencyCode)}</p><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(payment.source)} · {new Date(payment.receivedAt).toLocaleDateString()}</p></div><div className="flex flex-wrap gap-2"><Badge variant="success">{payment.status}</Badge><Badge variant="warning">{payment.reconciliationStatus}</Badge></div><Button asChild size="sm" variant="ghost"><Link href={`/receipts/${payment.receiptDocumentId}`}>Receipt <ArrowRight className="h-4 w-4" /></Link></Button></div>)}</div> : <div className="px-6 py-14 text-center"><WalletCards className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-4 font-semibold">No payments recorded</p><p className="mt-2 text-sm text-muted-foreground">Record an externally received payment against an open charge.</p></div>}</CardContent></Card>
    <Card><CardHeader className="border-b"><CardTitle>Resident balances</CardTitle><CardDescription>Remaining amounts reflect allocations posted to accounts receivable.</CardDescription></CardHeader><CardContent className="p-0"><div className="divide-y">{workspace.items.map((item) => <div key={item.tenancyId} className="grid gap-3 px-5 py-5 sm:grid-cols-3 sm:items-center"><div><p className="font-semibold">{item.propertyName}</p><p className="text-sm text-muted-foreground">Unit {item.unitCode}</p></div><p className="font-mono font-semibold">{money(item.balanceMinor, item.currencyCode)}</p><div className="sm:text-right"><p className="text-sm">{item.nextDueDate ?? "No upcoming charge"}</p>{item.nextDueAmountMinor != null ? <p className="font-mono text-xs text-muted-foreground">{money(item.nextDueAmountMinor, item.currencyCode)} remaining</p> : null}</div></div>)}</div></CardContent></Card>
  </div>;
}
