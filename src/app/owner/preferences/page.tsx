import Link from "next/link";
import { ArrowLeft, BellRing, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getNotificationPreferencesWorkspace } from "@/lib/data/notification-preferences";

export const dynamic = "force-dynamic";

/**
 * The owner route keeps the owner.crecyos.com origin used by owner-mail links and unsubscribe
 * headers. The record itself remains the same user-bound notification preference record edited by
 * the resident and operator surfaces.
 */
export default async function OwnerNotificationPreferencesPage() {
  const workspace = await getNotificationPreferencesWorkspace();

  return (
    <OwnerShell chromeTitle="Owner account controls" chromeDescription="Delivery channels, accessibility, and diagnostics">
      <div className="space-y-7">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/owner"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Owner overview</Link>
        </Button>

        <PageHeader
          context="Personal delivery record"
          title="Notifications and accessibility"
          description="Set how operational records reach you and review sanitized delivery activity. Invitations and security messages remain available regardless of these choices."
          meta="Preferences apply to your signed-in account across Crecy surfaces"
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
            audience="owner"
            profile={workspace.profile}
            initialChannels={workspace.channels}
            deliverySummary={workspace.deliverySummary}
            recentDeliveries={workspace.recentDeliveries}
            disabled={workspace.mode !== "ready"}
            presentation="owner"
          />
        )}
      </div>
    </OwnerShell>
  );
}
