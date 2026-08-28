import { CircleAlert, ShieldCheck } from "lucide-react";
import { AnnouncementManager } from "@/app/app/announcements/announcement-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getOperatorAnnouncementWorkspace } from "@/lib/data/announcements";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

export default async function OperatorAnnouncementsPage() {
  const organizationId = await getActiveOrganizationId();
  const workspace = await getOperatorAnnouncementWorkspace(organizationId);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><p className="text-sm text-muted-foreground">Communications</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Announcements</h1><p className="mt-2 text-sm text-muted-foreground">Publish transactional updates to explicitly expanded resident or owner audiences.</p></div>
      {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Announcements preview</AlertTitle><AlertDescription>This sample shows the announcement workflow until Supabase is connected.</AlertDescription></Alert> : null}
      {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Announcements unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
      <AnnouncementManager items={workspace.items} properties={workspace.properties} tenancies={workspace.tenancies} disabled={workspace.mode !== "ready"} />
    </div>
  );
}
