import Link from "next/link";
import { ArrowLeft, BellRing, CircleAlert } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { Wordmark } from "@/components/brand/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getNotificationPreferencesWorkspace } from "@/lib/data/notification-preferences";

export const dynamic = "force-dynamic";

/**
 * Owner notification preferences.
 *
 * Lives under /owner rather than reusing /settings/notifications so the page keeps the Crecy Owner
 * shell an owner arrives in — and, more concretely, so the List-Unsubscribe header on owner mail can
 * point at owner.crecyos.com, matching the From domain and the body's links. The underlying record is
 * the same one the operator and resident pages edit.
 */
export default async function OwnerNotificationPreferencesPage() {
  const workspace = await getNotificationPreferencesWorkspace();
  return (
    <div className="min-h-screen bg-[#f6f8fb] pb-12">
      <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Owner</Badge></div></header>
      <main className="mx-auto max-w-5xl space-y-5 p-5 sm:py-8">
        <Button asChild variant="ghost" size="sm"><Link href="/owner"><ArrowLeft className="h-4 w-4" />Owner workspace</Link></Button>
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><BellRing className="h-4 w-4" />Preferences</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Notifications and accessibility</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Choose how Crecy tells you about statements, approvals, and messages for your ownership. Invitations and security messages always reach you, whatever you choose here.</p>
        </div>
        {workspace.mode === "setup" ? (
          <Alert variant="info"><BellRing className="h-5 w-5" /><AlertTitle>Preferences preview</AlertTitle><AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription></Alert>
        ) : null}
        {workspace.mode === "error" || !workspace.profile ? (
          <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Preferences unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId ?? "unavailable"}.</AlertDescription></Alert>
        ) : (
          <NotificationPreferencesForm
            audience="owner"
            profile={workspace.profile}
            initialChannels={workspace.channels}
            deliverySummary={workspace.deliverySummary}
            recentDeliveries={workspace.recentDeliveries}
            disabled={workspace.mode !== "ready"}
          />
        )}
      </main>
    </div>
  );
}
