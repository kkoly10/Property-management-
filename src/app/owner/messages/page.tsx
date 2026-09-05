import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { ConversationList } from "@/components/messaging/conversation-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getConversationWorkspace } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function OwnerMessagesPage() {
  const workspace = await getConversationWorkspace();
  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark product="Owner" className="text-[#0f766e]" /></div></header>
      <main className="mx-auto max-w-3xl space-y-6 p-5 sm:py-8">
        <Button asChild size="sm" variant="ghost"><Link href="/owner"><ArrowLeft className="h-4 w-4" />Owner home</Link></Button>
        <div><p className="text-sm text-muted-foreground">Owner portal</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Messages</h1><p className="mt-2 text-sm text-muted-foreground">Contact the property team through your exact owner relationship.</p></div>
        {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Messages preview</AlertTitle><AlertDescription>This sample shows the owner conversation experience until Supabase is connected.</AlertDescription></Alert> : null}
        {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Messages unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
        <ConversationList items={workspace.items} routeBase="/owner/messages" />
      </main>
    </div>
  );
}

