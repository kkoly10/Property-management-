import Link from "next/link";
import { ArrowLeft, BellRing, CircleAlert } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { Wordmark } from "@/components/brand/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getNotificationPreferencesWorkspace } from "@/lib/data/notification-preferences";

export const dynamic = "force-dynamic";

/**
 * Operator notification preferences.
 *
 * Same workspace fetcher, same command, same record as the resident page: `notification_preferences`
 * is keyed by `(user_id, category, channel)` with no organization or audience column, and the RPCs
 * resolve the actor from `auth.uid()` alone. There is nothing operator-specific to model — the gap was
 * only ever that operators had no door onto their own preferences.
 */
export default async function OperatorNotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  // Same guard as /settings/privacy: a path-only destination, never a protocol-relative one that would
  // send an operator off-origin.
  const returnTo = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/app";
  const workspace = await getNotificationPreferencesWorkspace();
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
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><BellRing className="h-4 w-4" />Notifications</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">How Crecy reaches you</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Choose the channels for your own operational updates. These are your personal preferences, not your organization&rsquo;s — they follow your account across every workspace you belong to, and they never affect what residents or owners receive.</p>
        </div>
        {workspace.mode === "setup" ? (
          <Alert variant="info"><BellRing className="h-5 w-5" /><AlertTitle>Preferences preview</AlertTitle><AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription></Alert>
        ) : null}
        {workspace.mode === "error" || !workspace.profile ? (
          <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Preferences unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId ?? "unavailable"}.</AlertDescription></Alert>
        ) : (
          <NotificationPreferencesForm
            audience="operator"
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
