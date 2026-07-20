import Link from "next/link";
import { ArrowLeft, ExternalLink, Landmark, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function PaymentSettingsPage() {
  return (
    <main className="min-h-screen p-5 lg:p-10"><div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" asChild><Link href="/app"><ArrowLeft className="h-4 w-4" />Back to command center</Link></Button>
      <div><p className="text-sm font-semibold text-primary">Settings</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Payment connection</h1><p className="mt-2 text-muted-foreground">Connect the operator&apos;s merchant account before residents can pay online.</p></div>
      <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Operator-controlled funds flow</AlertTitle><AlertDescription>Rent is processed on your connected merchant account. Crecy does not hold your rent.</AlertDescription></Alert>
      <Card><CardHeader className="flex-row items-start justify-between border-b"><div><CardTitle>Stripe Connect</CardTitle><CardDescription>Sandbox onboarding for the selected operating entity.</CardDescription></div><Badge variant="neutral">Not connected</Badge></CardHeader><CardContent className="pt-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Landmark className="h-6 w-6" /></span><div className="min-w-0 flex-1"><p className="font-semibold">Complete Stripe-hosted verification</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Crecy will never ask for or store your full banking credentials on this screen.</p></div><Button disabled>Connect Stripe <ExternalLink className="h-4 w-4" /></Button></div><p className="mt-5 rounded-lg bg-muted p-4 text-sm text-muted-foreground">The connection command remains disabled until a Supabase project, Stripe sandbox keys, MFA, and the payment traceability tests are configured.</p></CardContent></Card>
    </div></main>
  );
}
