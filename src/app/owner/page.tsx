import Link from "next/link";
import { ArrowRight, Building2, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getOwnerApprovalWorkspace } from "@/lib/data/owner-approvals";

export const dynamic = "force-dynamic";
const label = (value: string) => value.replaceAll("_", " ");
const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

export default async function OwnerHomePage() {
  const workspace = await getOwnerApprovalWorkspace();
  const pending = workspace.items.filter((item) => item.status === "pending").length;
  return <div className="min-h-screen bg-[#f6f8fb] pb-12">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Owner</Badge></div></header>
    <main className="mx-auto max-w-5xl space-y-6 p-5 sm:py-8">
      <div><p className="text-sm text-muted-foreground">Owner workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Approvals</h1><p className="mt-2 text-sm text-muted-foreground">{pending} {pending === 1 ? "request needs" : "requests need"} your decision</p></div>
      {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Owner portal preview</AlertTitle><AlertDescription>This sample is read-only until Supabase and an owner relationship are connected.</AlertDescription></Alert> : null}
      {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Approvals unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
      {workspace.items.length ? <div className="grid gap-4">{workspace.items.map((item) => <Card key={item.approvalRequestId}><CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === "approved" ? "success" : item.status === "rejected" ? "neutral" : "warning"}>{label(item.status)}</Badge><span className="font-mono text-xs text-muted-foreground">{item.workOrderReference}</span></div><h2 className="mt-3 font-semibold">{item.scope}</h2><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Building2 className="h-4 w-4" />{item.propertyName}{item.unitCode ? ` · Unit ${item.unitCode}` : ""}</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Requested {new Date(item.requestedAt).toLocaleDateString()}</span>{item.amountMinor !== null && item.currencyCode ? <span className="font-semibold text-foreground">{money(item.amountMinor, item.currencyCode)}</span> : null}</div></div><Button asChild size="sm" variant="outline"><Link href={`/owner/approvals/${item.approvalRequestId}`}>Review <ArrowRight className="h-4 w-4" /></Link></Button></CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>No approval requests</CardTitle><CardDescription>New requests assigned to your exact owner entity will appear here.</CardDescription></CardHeader></Card>}
    </main>
  </div>;
}
