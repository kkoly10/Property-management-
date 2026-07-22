import Link from "next/link";
import { ArrowLeft, CircleAlert, Clock3, RotateCcw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { getResidentPaymentRetryContext, getResidentPaymentSessionOptions } from "@/lib/data/finance";
import { ResidentPaymentForm } from "./resident-payment-form";

export const dynamic = "force-dynamic";

export default async function NewResidentPaymentPage({ searchParams }: { searchParams: Promise<{ payment?: string; retry?: string }> }) {
  const { payment, retry: retryPaymentId } = await searchParams;
  const [workspace, retryResult] = await Promise.all([getResidentPaymentSessionOptions(), retryPaymentId ? getResidentPaymentRetryContext(retryPaymentId) : Promise.resolve({ mode: "not_found" as const, retry: undefined, requestId: undefined })]);
  return <div className="min-h-screen bg-[#f6f8fb] pb-12">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Living</Badge></div></header>
    <main className="mx-auto max-w-3xl space-y-6 p-5 sm:py-8">
      <div><Button asChild size="sm" variant="ghost"><Link href="/home"><ArrowLeft className="h-4 w-4" />Resident home</Link></Button><h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">Make a payment</h1><p className="mt-2 text-sm text-muted-foreground">Choose open charges, review the method, then continue to Stripe’s secure checkout.</p></div>
      {payment === "returned" ? <Alert variant="info"><Clock3 className="h-5 w-5" /><AlertTitle>Payment submitted for confirmation</AlertTitle><AlertDescription>Returning from Stripe does not confirm payment. Card updates usually arrive quickly; bank payments can remain pending for several business days. Your balance changes only after Stripe confirms the funds.</AlertDescription></Alert> : null}
      {payment === "canceled" ? <Alert variant="warning"><CircleAlert className="h-5 w-5" /><AlertTitle>Checkout canceled</AlertTitle><AlertDescription>No payment was confirmed. You can review the amount and try again.</AlertDescription></Alert> : null}
      {retryResult.retry ? <Alert variant="warning"><RotateCcw className="h-5 w-5" /><AlertTitle>Start a new attempt for {retryResult.retry.publicReference}</AlertTitle><AlertDescription>The previous checkout ended without a confirmed payment. We prefilled the still-available charges below; reviewing and submitting creates a new payment attempt.</AlertDescription></Alert> : null}
      {retryPaymentId && retryResult.mode === "not_found" ? <Alert variant="warning"><CircleAlert className="h-5 w-5" /><AlertTitle>This payment cannot be retried</AlertTitle><AlertDescription>It may still be processing, may already be complete, or the open charges may have changed. You can start a separate payment below.</AlertDescription></Alert> : null}
      {retryPaymentId && retryResult.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Retry details unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {retryResult.requestId}.</AlertDescription></Alert> : null}
      {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Payment preview</AlertTitle><AlertDescription>This screen uses sample charges until Supabase and Stripe sandbox credentials are connected.</AlertDescription></Alert> : null}
      {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Payment options unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
      <ResidentPaymentForm options={workspace.options} retry={retryResult.retry} disabled={workspace.mode !== "ready"} />
    </main>
  </div>;
}
