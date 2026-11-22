import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { SESSION_SETTINGS_PATH } from "@/lib/auth/session-settings-path";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { MfaSetup } from "./mfa-setup";

export const dynamic = "force-dynamic";

export default async function MfaSettingsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const query = await searchParams;
  const returnTo = safeRedirectPath(query.returnTo, "/settings/payments");
  const requireChallenge = new URL(returnTo, "https://crecy.invalid").pathname === SESSION_SETTINGS_PATH;
  const configured = Boolean(getPublicSupabaseConfig());
  return <main className="min-h-screen gutter-5 py-5 lg:gutter-8 lg:py-10"><div className="mx-auto max-w-xl space-y-6">
    <Button variant="ghost" asChild><Link href={returnTo}><ArrowLeft className="h-4 w-4" />Back</Link></Button>
    <Card><CardHeader><CardTitle>Security check</CardTitle><CardDescription>Authenticator verification protects sensitive account, payment, and privacy actions from a stolen password or session.</CardDescription></CardHeader><CardContent>{configured ? <MfaSetup key={returnTo} returnTo={returnTo} requireChallenge={requireChallenge} /> : <Alert variant="info"><AlertTitle>Supabase setup required</AlertTitle><AlertDescription>Add the Supabase project values before enrolling an authenticator.</AlertDescription></Alert>}</CardContent></Card>
  </div></main>;
}
