import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { LivingShell } from "@/components/living/living-shell";
import { ConversationThread } from "@/components/messaging/conversation-thread";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getConversationDetail } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function ResidentConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const result = await getConversationDetail(conversationId);

  return (
    <LivingShell maxWidth="max-w-3xl">
      <div className="space-y-5">
        <Link href="/messages" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Messages
        </Link>

        {result.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Messages preview</AlertTitle>
            <AlertDescription>Sending is available after Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}

        {result.mode === "error" || !result.item ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Conversation unavailable</AlertTitle>
            <AlertDescription>The conversation was not found or is outside your access. Request {result.requestId}.</AlertDescription>
          </Alert>
        ) : (
          <>
            <header className="border-b pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[1.75rem] font-semibold tracking-[-0.035em]">{result.item.audienceLabel}</h1>
                {result.item.status !== "open" ? <Badge variant="neutral">{result.item.status}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{result.item.propertyName ?? result.item.subject}</p>
            </header>

            <ConversationThread
              conversationId={conversationId}
              messages={result.item.messages}
              disabled={result.mode !== "ready" || result.item.status !== "open"}
            />
          </>
        )}
      </div>
    </LivingShell>
  );
}
