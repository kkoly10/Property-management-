import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { MfaSetup } from "./mfa-setup";

export const dynamic = "force-dynamic";

export default async function MfaSettingsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/settings/payments";
  const configured = Boolean(getPublicSupabaseConfig());
  return <main className="min-h-screen p-5 lg:p-10"><div className="mx-auto max-w-xl space-y-6">
    <Button variant="ghost" asChild><Link href={returnTo}><ArrowLeft className="h-4 w-4" />Back</Link></Button>
    <Card><CardHeader><CardTitle>Security check</CardTitle><CardDescription>Authenticator verification protects sensitive account, payment, and privacy actions from a stolen password or session.</CardDescription></CardHeader><CardContent>{configured ? <MfaSetup returnTo={returnTo} /> : <Alert variant="info"><AlertTitle>Supabase setup required</AlertTitle><AlertDescription>Add the Supabase project values before enrolling an authenticator.</AlertDescription></Alert>}</CardContent></Card>
  </div></main>;
}
