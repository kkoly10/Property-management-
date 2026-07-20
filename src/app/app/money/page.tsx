import { CalendarClock, CircleAlert, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperatorReceivables, type ReceivableSummaryItem } from "@/lib/data/finance";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amountMinor / 100);
}

function totalsByCurrency(items: ReceivableSummaryItem[]) {
  return items.reduce<Record<string, number>>((totals, item) => {
    totals[item.currencyCode] = (totals[item.currencyCode] ?? 0) + item.balanceMinor;
    return totals;
  }, {});
}

export default async function MoneyPage() {
  const receivables = await getOperatorReceivables();
  const totals = totalsByCurrency(receivables.items);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">Finance operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Money</h1><p className="mt-2 text-sm text-muted-foreground">Balances derived from posted journals. No balance can be edited directly.</p></div>
      {receivables.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Finance preview</AlertTitle><AlertDescription>This sample demonstrates the receivables view until Supabase is connected.</AlertDescription></Alert> : null}
      {receivables.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Receivables unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {receivables.requestId}.</AlertDescription></Alert> : null}
      <section aria-label="Receivables summary" className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><Landmark className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Outstanding balances</p><div className="mt-2 space-y-1">{Object.entries(totals).length ? Object.entries(totals).map(([currency, amount]) => <p key={currency} className="font-mono text-xl font-semibold">{money(amount, currency)}</p>) : <p className="text-2xl font-semibold">—</p>}</div></CardContent></Card>
        <Card><CardContent className="p-5"><ReceiptText className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Active receivables</p><p className="mt-2 text-2xl font-semibold">{receivables.items.length}</p><p className="mt-2 text-xs text-muted-foreground">Property-scoped finance access</p></CardContent></Card>
        <Card><CardContent className="p-5"><CalendarClock className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Due or scheduled</p><p className="mt-2 text-2xl font-semibold">{receivables.items.filter((item) => item.nextDueDate).length}</p><p className="mt-2 text-xs text-muted-foreground">Earliest item per tenancy</p></CardContent></Card>
      </section>
      <Card><CardHeader className="border-b"><CardTitle>Resident balances</CardTitle><CardDescription>Posted accounts receivable and the next open or scheduled rent item.</CardDescription></CardHeader><CardContent className="p-0">
        {receivables.items.length ? <div className="divide-y">{receivables.items.map((item) => <div key={item.tenancyId} className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold">{item.propertyName}</p><p className="mt-1 text-sm text-muted-foreground">Unit {item.unitCode}</p></div><div><p className="text-xs text-muted-foreground">Balance</p><p className="mt-1 font-mono font-semibold">{money(item.balanceMinor, item.currencyCode)}</p></div><div><p className="text-xs text-muted-foreground">Next due</p><p className="mt-1 text-sm font-medium">{item.nextDueDate ?? "No upcoming charge"}</p>{item.nextDueAmountMinor !== null ? <p className="mt-1 font-mono text-xs text-muted-foreground">{money(item.nextDueAmountMinor, item.currencyCode)}</p> : null}</div><Badge variant={item.nextDueStatus === "open" ? "warning" : "info"}>{item.nextDueStatus ?? "current"}</Badge></div>)}</div> : <div className="px-6 py-14 text-center"><WalletCards className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-4 font-semibold">No finance-visible tenancies</p><p className="mt-2 text-sm text-muted-foreground">Charges appear after an active tenancy reaches its first scheduled due date.</p></div>}
      </CardContent></Card>
    </div>
  );
}
