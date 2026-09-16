import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { ConversationList } from "@/components/messaging/conversation-list";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getConversationWorkspace } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function OwnerMessagesPage() {
  const workspace = await getConversationWorkspace();

  return (
    <OwnerShell chromeTitle="Owner correspondence" chromeDescription="Property-team messages tied to your ownership">
      <div className="space-y-7">
        <Button asChild size="sm" variant="ghost" className="-ml-2">
          <Link href="/owner"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Owner overview</Link>
        </Button>

        <PageHeader
          context="Owner relationship communication"
          title="Correspondence register"
          description="A restrained record of conversations between your ownership and the property team. Each thread remains limited to its authorized participants."
          meta={`${workspace.items.length} ${workspace.items.length === 1 ? "conversation" : "conversations"}`}
        />

        {workspace.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Messages preview</AlertTitle>
            <AlertDescription>This sample shows the owner correspondence experience until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Messages unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        <ConversationList items={workspace.items} routeBase="/owner/messages" presentation="owner" />
      </div>
    </OwnerShell>
  );
}

