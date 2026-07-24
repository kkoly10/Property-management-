import { CircleAlert, ShieldCheck } from "lucide-react";
import { ConversationList } from "@/components/messaging/conversation-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getConversationWorkspace } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function OperatorMessagesPage() {
  const workspace = await getConversationWorkspace();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><p className="text-sm text-muted-foreground">Communications</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Messages</h1><p className="mt-2 text-sm text-muted-foreground">Resident and owner conversations are limited by your active property scopes.</p></div>
      {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Messages preview</AlertTitle><AlertDescription>This sample shows the operator inbox until Supabase is connected.</AlertDescription></Alert> : null}
      {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Messages unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
      <ConversationList items={workspace.items} routeBase="/app/messages" />
    </div>
  );
}

