import { BellRing, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { LivingShell } from "@/components/living/living-shell";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getNotificationPreferencesWorkspace } from "@/lib/data/notification-preferences";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const workspace = await getNotificationPreferencesWorkspace();

  return (
    <LivingShell maxWidth="max-w-5xl">
      <div className="space-y-6">
        <PageHeader
          title="Preferences"
          description="Choose transactional delivery channels, language, text size, and accessibility settings for your account."
        />

        {workspace.mode === "setup" ? (
          <Alert variant="info">
            <BellRing aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Preferences preview</AlertTitle>
            <AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}

        {workspace.mode === "error" || !workspace.profile ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Preferences unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {workspace.requestId ?? "unavailable"}.</AlertDescription>
          </Alert>
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
      </div>
    </LivingShell>
  );
}
