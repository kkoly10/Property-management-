import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { PrivacyRequestCenter } from "@/app/settings/privacy/privacy-request-center";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { getPrivacyRequestWorkspace } from "@/lib/data/privacy";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/";
  const workspace = await getPrivacyRequestWorkspace();
  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Wordmark />
          <Button variant="ghost" size="sm" asChild><Link href={returnTo}><ArrowLeft className="h-4 w-4" />Back</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 p-5 sm:py-8">
        <div>
          <p className="text-sm font-semibold text-primary">Privacy rights center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Your information requests</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Submit, verify, and track privacy requests without exposing the underlying private job records.</p>
        </div>
        {workspace.mode === "setup" ? (
          <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Privacy workflow preview</AlertTitle><AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription></Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Privacy requests unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert>
        ) : null}
        <PrivacyRequestCenter
          authenticatorLevel={workspace.authenticatorLevel}
          organizations={workspace.organizations}
          items={workspace.items}
          disabled={workspace.mode !== "ready"}
        />
      </main>
    </div>
  );
}
