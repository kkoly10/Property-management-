import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getSessionSettings } from "@/lib/auth/session-revocation";
import { SESSION_SETTINGS_PATH } from "@/lib/auth/session-settings-path";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { RevokeSessionsForm } from "./revoke-sessions-form";

export const dynamic = "force-dynamic";

export default async function AccountSessionsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const query = await searchParams;
  const returnTo = safeRedirectPath(query.returnTo, "/");
  const sessionPage = `${SESSION_SETTINGS_PATH}?${new URLSearchParams({ returnTo })}`;
  const verificationHref = `/settings/security/mfa?${new URLSearchParams({ returnTo: sessionPage })}`;
  const session = getPublicSupabaseConfig() ? await getSessionSettings() : { state: "unavailable" } as const;
  if (session.state === "signed_out") redirect(`/login?${new URLSearchParams({ next: sessionPage })}`);

  return <main className="min-h-screen gutter-5 py-5 lg:gutter-8 lg:py-10">
    <div className="mx-auto max-w-xl space-y-6">
      <Button variant="ghost" asChild><Link href={returnTo}><ArrowLeft className="h-4 w-4" />Back</Link></Button>
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">Account sessions</h1>
          <CardDescription>Sign out other browsers and devices across Crecy. This browser stays signed in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {session.state === "unavailable" && <Alert variant="destructive">
            <AlertTitle>Session settings are unavailable</AlertTitle>
            <AlertDescription>Refresh the page to try again.</AlertDescription>
          </Alert>}
          {session.state === "ready" && <>
            {session.email && <p className="text-sm">Signed in as <strong className="break-all">{session.email}</strong></p>}
            <p className="text-sm text-muted-foreground">Other sessions lose the ability to renew. Their current access can continue until the access token expires.</p>
            {session.verifiedRecently
              ? <RevokeSessionsForm sessionId={session.sessionId} verificationHref={verificationHref} />
              : <Button asChild><Link href={verificationHref}>Verify with your authenticator</Link></Button>}
          </>}
        </CardContent>
      </Card>
    </div>
  </main>;
}
