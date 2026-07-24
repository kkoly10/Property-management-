import Link from "next/link";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { ConversationList } from "@/components/messaging/conversation-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getConversationWorkspace } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function ResidentMessagesPage() {
  const workspace = await getConversationWorkspace();
  return (
    <div className="min-h-screen bg-[#f6f8fb] pb-24">
      <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Living</Badge></div></header>
      <main className="mx-auto max-w-3xl space-y-6 p-5 sm:py-8">
        <div><p className="text-sm text-muted-foreground">Resident portal</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Messages</h1><p className="mt-2 text-sm text-muted-foreground">Contact your property team in a conversation tied to your active home.</p></div>
        {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Messages preview</AlertTitle><AlertDescription>This sample shows the conversation experience until Supabase is connected.</AlertDescription></Alert> : null}
        {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Messages unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
        <ConversationList items={workspace.items} routeBase="/messages" />
      </main>
      <nav aria-label="Resident" className="fixed inset-x-0 bottom-0 border-t bg-white/95 px-4 py-3 backdrop-blur sm:hidden"><div className="mx-auto flex max-w-md items-center justify-around text-xs font-medium"><Link className="text-muted-foreground" href="/home">Home</Link><Link className="text-muted-foreground" href="/payments/new">Payments</Link><Link className="text-muted-foreground" href="/maintenance">Maintenance</Link><Link className="text-primary" href="/messages">Messages</Link></div></nav>
    </div>
  );
}

