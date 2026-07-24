import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, CircleAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getOwnerApprovalDetail } from "@/lib/data/owner-approvals";
import { OwnerApprovalForm } from "./owner-approval-form";

export const dynamic = "force-dynamic";
const label = (value: string) => value.replaceAll("_", " ");
const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

export default async function OwnerApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const detail = await getOwnerApprovalDetail(approvalId);
  if (detail.mode === "ready" && !detail.item) notFound();
  const item = detail.item;
  return <div className="min-h-screen bg-[#f6f8fb] pb-12">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Owner</Badge></div></header>
    <main className="mx-auto max-w-4xl space-y-6 p-5 sm:py-8">
      <Button asChild variant="ghost" size="sm"><Link href="/owner"><ArrowLeft className="h-4 w-4" />Approvals</Link></Button>
      {detail.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Approval preview</AlertTitle><AlertDescription>The sample decision controls are disabled until Supabase is connected.</AlertDescription></Alert> : null}
      {detail.mode === "error" || !item ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Approval unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription></Alert> : <>
        <div><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === "approved" ? "success" : item.status === "rejected" ? "neutral" : "warning"}>{label(item.status)}</Badge><span className="font-mono text-xs text-muted-foreground">{item.workOrderReference}</span></div><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">Review work order</h1><p className="mt-2 text-sm text-muted-foreground">{item.propertyName}{item.unitCode ? ` · Unit ${item.unitCode}` : ""} · Requested for {item.ownerName}</p></div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
          <Card><CardHeader className="border-b"><CardTitle>Request details</CardTitle><CardDescription>{label(item.approvalType)}</CardDescription></CardHeader><CardContent className="space-y-5 p-5 text-sm"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</p><p className="mt-2 leading-6">{item.scope}</p></div>{item.amountMinor !== null && item.currencyCode ? <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</p><p className="mt-1 text-2xl font-semibold">{money(item.amountMinor, item.currencyCode)}</p></div> : null}<div className="flex items-center gap-2 text-muted-foreground"><Camera className="h-4 w-4" />{item.evidenceCount} completion evidence {item.evidenceCount === 1 ? "file" : "files"}</div><div><p className="text-xs text-muted-foreground">Requested {new Date(item.requestedAt).toLocaleString()}</p>{item.decidedAt ? <p className="mt-1 text-xs text-muted-foreground">Decided {new Date(item.decidedAt).toLocaleString()}</p> : null}{item.reason ? <p className="mt-3 rounded-lg bg-muted p-3"><span className="font-medium">Decision comment:</span> {item.reason}</p> : null}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>{item.status === "pending" ? "Your decision" : "Decision recorded"}</CardTitle><CardDescription>{item.status === "pending" ? "Only a user related to this exact owner entity can respond." : `This request is ${item.status}.`}</CardDescription></CardHeader><CardContent>{item.status === "pending" ? <OwnerApprovalForm approvalRequestId={item.approvalRequestId} version={item.version} disabled={detail.mode !== "ready"} /> : <Alert variant={item.status === "approved" ? "info" : "destructive"}><AlertTitle>{label(item.status)}</AlertTitle><AlertDescription>No further decision can be recorded for this request.</AlertDescription></Alert>}</CardContent></Card>
        </div>
      </>}
    </main>
  </div>;
}
