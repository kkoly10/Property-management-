import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { ConversationThread } from "@/components/messaging/conversation-thread";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getConversationDetail } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function OperatorConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const result = await getConversationDetail(conversationId);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button asChild size="sm" variant="ghost"><Link href="/app/messages"><ArrowLeft className="h-4 w-4" />Messages</Link></Button>
      {result.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Messages preview</AlertTitle><AlertDescription>Sending is available after Supabase is connected.</AlertDescription></Alert> : null}
      {result.mode === "error" || !result.item ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Conversation unavailable</AlertTitle><AlertDescription>The conversation was not found or is outside your access. Request {result.requestId}.</AlertDescription></Alert> : (
        <>
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.035em]">{result.item.audienceLabel}</h1>{result.item.status !== "open" ? <Badge variant="neutral">{result.item.status}</Badge> : null}</div><p className="mt-2 text-sm text-muted-foreground">{result.item.propertyName ?? result.item.subject}</p></div>
          <ConversationThread conversationId={conversationId} messages={result.item.messages} disabled={result.mode !== "ready" || result.item.status !== "open"} />
        </>
      )}
    </div>
  );
}

