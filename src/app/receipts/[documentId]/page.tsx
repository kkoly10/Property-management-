import Link from "next/link";
import { ArrowLeft, CircleAlert, ReceiptText, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPaymentReceipt } from "@/lib/data/finance";

export const dynamic = "force-dynamic";
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);

export default async function ReceiptPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const state = await getPaymentReceipt(documentId);
  if (!state.receipt) return <main className="mx-auto max-w-2xl p-6"><Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Receipt unavailable</AlertTitle><AlertDescription>This receipt does not exist or is outside your access scope. {state.requestId ? `Request ${state.requestId}.` : ""}</AlertDescription></Alert></main>;
  const receipt = state.receipt;
  return <main className="min-h-screen bg-[#f6f8fb] p-5 sm:py-10 print:bg-white print:p-0"><article className="mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-sm print:border-0 print:shadow-none">
    <header className="border-b p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-5 print:hidden"><Link href="/app/payments"><ArrowLeft className="h-4 w-4" />Back</Link></Button><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><ReceiptText className="h-5 w-5" /></span><div><p className="text-sm text-muted-foreground">{receipt.organizationName}</p><h1 className="text-2xl font-semibold">Payment receipt</h1></div></div></div><Badge variant="success">{receipt.status}</Badge></div></header>
    <div className="space-y-7 p-6 sm:p-8"><div><p className="text-sm text-muted-foreground">Amount received</p><p className="mt-2 font-mono text-4xl font-semibold tracking-tight">{money(receipt.amountMinor, receipt.currencyCode)}</p><p className="mt-2 text-sm text-muted-foreground">{new Date(receipt.receivedAt).toLocaleString()} · {receipt.source.replaceAll("_", " ")}</p></div>
      <dl className="grid gap-4 rounded-xl bg-muted/40 p-5 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Receipt</dt><dd className="mt-1 font-mono font-medium">{receipt.publicReference}</dd></div><div><dt className="text-muted-foreground">Resident</dt><dd className="mt-1 font-medium">{receipt.householdName}</dd></div><div><dt className="text-muted-foreground">Home</dt><dd className="mt-1 font-medium">{receipt.propertyName} · Unit {receipt.unitCode}</dd></div><div><dt className="text-muted-foreground">External reference</dt><dd className="mt-1 font-medium">{receipt.externalReference ?? "Not provided"}</dd></div></dl>
      <section><h2 className="font-semibold">Applied to</h2><div className="mt-3 divide-y rounded-xl border">{receipt.allocations.map((allocation) => <div key={allocation.chargeId} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{allocation.description}</p><p className="mt-1 text-xs text-muted-foreground">Due {allocation.dueDate}</p></div><p className="font-mono font-semibold">{money(allocation.amountMinor, receipt.currencyCode)}</p></div>)}</div></section>
      <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>System-generated record</AlertTitle><AlertDescription>Generated {new Date(receipt.generatedAt).toLocaleString()}. This receipt is immutable and reflects the posted ledger transaction.</AlertDescription></Alert>
    </div>
  </article></main>;
}
