import { CircleAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { LivingShell } from "@/components/living/living-shell";
import { ConversationList } from "@/components/messaging/conversation-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getConversationWorkspace } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function ResidentMessagesPage() {
  const workspace = await getConversationWorkspace();

  return (
    <LivingShell maxWidth="max-w-3xl">
      <div className="space-y-6">
        <PageHeader
          title="Messages"
          description="Keep conversations with your property team tied to your active home and resident record."
        />

        {workspace.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Messages preview</AlertTitle>
            <AlertDescription>This sample shows the conversation experience until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Messages unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        <ConversationList items={workspace.items} routeBase="/messages" presentation="living" />
      </div>
    </LivingShell>
  );
}
