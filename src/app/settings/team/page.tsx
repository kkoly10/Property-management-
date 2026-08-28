import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck, UsersRound } from "lucide-react";
import { TeamManager } from "@/app/settings/team/team-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getStaffWorkspace } from "@/lib/data/staff";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { redirect } from "next/navigation";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const organizationId = await getActiveOrganizationId();
  // These routes sit outside the operator layout, so they carry no switcher and no context notice.
  // Without a selection there is nothing to show and no way to choose from here — send the operator to
  // the shell, which is where the picker lives. (Preview mode has no context and renders sample data.)
  if (!organizationId && getPublicSupabaseConfig()) redirect("/app");
  const workspace = await getStaffWorkspace(organizationId);
  return (
    <main className="min-h-screen p-5 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Button variant="ghost" asChild><Link href="/app"><ArrowLeft className="h-4 w-4" />Back to command center</Link></Button>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><UsersRound className="h-6 w-6" /></span>
          <div>
            <p className="text-sm font-semibold text-primary">Settings</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Team and property access</h1>
            <p className="mt-2 text-muted-foreground">Invite staff, assign roles, bound access by property and date, and revoke access immediately.</p>
          </div>
        </div>
        {workspace.mode === "setup" ? (
          <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Team workflow preview</AlertTitle><AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription></Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Team settings unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert>
        ) : null}
        <TeamManager
          authenticatorLevel={workspace.authenticatorLevel}
          organization={workspace.organization}
          staffSeatCount={workspace.staffSeatCount}
          staffSeatLimit={workspace.staffSeatLimit}
          members={workspace.members}
          roles={workspace.roles}
          properties={workspace.properties}
          disabled={workspace.mode !== "ready"}
        />
      </div>
    </main>
  );
}
