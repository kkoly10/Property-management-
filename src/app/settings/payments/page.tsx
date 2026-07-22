import Link from "next/link";
import { ArrowLeft, Landmark, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPaymentConnectionWorkspace } from "@/lib/data/payment-connections";
import { PaymentConnectionPanel } from "./payment-connection-panel";

export const dynamic = "force-dynamic";

export default async function PaymentSettingsPage() {
  const workspace = await getPaymentConnectionWorkspace();
  return (
    <main className="min-h-screen p-5 lg:p-10"><div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" asChild><Link href="/app"><ArrowLeft className="h-4 w-4" />Back to command center</Link></Button>
      <div><p className="text-sm font-semibold text-primary">Settings</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Payment connection</h1><p className="mt-2 text-muted-foreground">Connect the operator&apos;s merchant account before residents can pay online.</p></div>
      <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Operator-controlled funds flow</AlertTitle><AlertDescription>Rent is processed on your connected merchant account. Crecy does not hold your rent.</AlertDescription></Alert>
      {workspace.mode === "error" ? <Alert variant="destructive"><AlertTitle>Payment settings are unavailable</AlertTitle><AlertDescription>Try again shortly. Support reference: {workspace.requestId}</AlertDescription></Alert> : null}
      <Card><CardHeader className="flex-row items-start gap-4 border-b"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Landmark className="h-6 w-6" /></span><div><CardTitle>Stripe Connect</CardTitle><CardDescription>Stripe-hosted verification for each operating entity. Crecy never asks for or stores full banking credentials here.</CardDescription></div></CardHeader><CardContent className="pt-6"><PaymentConnectionPanel items={workspace.items} authenticatorLevel={workspace.authenticatorLevel} setupMode={workspace.mode === "setup"} /></CardContent></Card>
    </div></main>
  );
}
