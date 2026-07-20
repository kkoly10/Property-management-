import Link from "next/link";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getOperatorPaymentWorkspace } from "@/lib/data/finance";
import { ManualPaymentForm } from "./manual-payment-form";

export const dynamic = "force-dynamic";

export default async function RecordPaymentPage() {
  const workspace = await getOperatorPaymentWorkspace();
  return <div className="mx-auto max-w-4xl space-y-6">
    <Button asChild variant="ghost" size="sm"><Link href="/app/payments"><ArrowLeft className="h-4 w-4" />Payments</Link></Button>
    <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">Controlled entry</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Record manual payment</h1><p className="mt-2 text-sm text-muted-foreground">For money already received outside Crecy. This immediately posts an allocated, balanced journal.</p></div>
    {workspace.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Preview only</AlertTitle><AlertDescription>Connect Supabase to submit this workflow. The sample below shows the required controls.</AlertDescription></Alert> : null}
    {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Payment setup unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
    <ManualPaymentForm options={workspace.options} disabled={workspace.mode !== "ready"} />
  </div>;
}
