import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { PrivacyRequestCenter } from "@/app/settings/privacy/privacy-request-center";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getPrivacyRequestWorkspace } from "@/lib/data/privacy";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; view?: string; before?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeRedirectPath(query.returnTo, "/");
  const organizationId = await getActiveOrganizationId();
  const personal = query.view === "personal" || !organizationId;
  const before = personal && z.uuid().safeParse(query.before).success ? query.before : undefined;
  const workspace = await getPrivacyRequestWorkspace(personal ? null : organizationId, before);
  const viewHref = (view: "personal" | "workspace", cursor?: string) =>
    `/settings/privacy?${new URLSearchParams({ view, returnTo, ...(cursor ? { before: cursor } : {}) })}`;
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
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">{personal ? "Your information requests" : "Workspace information requests"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Submit a request, verify your identity, or check its status.</p>
        </div>
        {organizationId ? (
          <nav aria-label="Privacy request history views" className="flex flex-wrap gap-2">
            <Button size="sm" variant={personal ? "default" : "outline"} asChild>
              <Link href={viewHref("personal")} aria-current={personal ? "page" : undefined}>My requests</Link>
            </Button>
            <Button size="sm" variant={personal ? "outline" : "default"} asChild>
              <Link href={viewHref("workspace")} aria-current={personal ? undefined : "page"}>Selected workspace</Link>
            </Button>
          </nav>
        ) : null}
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
          returnTo={viewHref(personal ? "personal" : "workspace", before)}
          disabled={workspace.mode !== "ready"}
        />
        {before || workspace.nextCursor ? (
          <nav aria-label="Privacy request history pages" className="flex flex-wrap gap-2">
            {before ? <Button variant="outline" asChild><Link href={viewHref("personal")}>Latest requests</Link></Button> : null}
            {workspace.nextCursor ? <Button variant="outline" asChild><Link href={viewHref("personal", workspace.nextCursor)}>Older requests</Link></Button> : null}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
