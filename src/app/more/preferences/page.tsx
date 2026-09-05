import Link from "next/link";
import { ArrowLeft, BellRing, CircleAlert } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { Wordmark } from "@/components/brand/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getNotificationPreferencesWorkspace } from "@/lib/data/notification-preferences";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const workspace = await getNotificationPreferencesWorkspace();
  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Wordmark product="Living" />
          <Button variant="ghost" size="sm" asChild><Link href="/home"><ArrowLeft className="h-4 w-4" />Back home</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 p-5 sm:py-8">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><BellRing className="h-4 w-4" />Preferences</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Notifications and accessibility</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Control transactional delivery channels, language, and accessibility choices for your account.</p>
        </div>
        {workspace.mode === "setup" ? (
          <Alert variant="info"><BellRing className="h-5 w-5" /><AlertTitle>Preferences preview</AlertTitle><AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription></Alert>
        ) : null}
        {workspace.mode === "error" || !workspace.profile ? (
          <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Preferences unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId ?? "unavailable"}.</AlertDescription></Alert>
        ) : (
          <NotificationPreferencesForm
            audience="resident"
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

