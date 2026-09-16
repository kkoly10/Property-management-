import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { ConversationThread } from "@/components/messaging/conversation-thread";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getConversationDetail } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

export default async function OwnerConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const result = await getConversationDetail(conversationId);

  return (
    <OwnerShell chromeTitle="Owner correspondence" chromeDescription="Authorized messages with the property team">
      <div className="space-y-7">
        <Button asChild size="sm" variant="ghost" className="-ml-2">
          <Link href="/owner/messages"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Correspondence register</Link>
        </Button>

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
            <AlertDescription>The conversation was not found or is outside your access. Request {result.requestId ?? "unavailable"}.</AlertDescription>
          </Alert>
        ) : (
          <>
            <PageHeader
              context={result.item.propertyName ?? "Owner relationship"}
              title={result.item.audienceLabel}
              description={result.item.subject}
              meta={`${result.item.messages.length} ${result.item.messages.length === 1 ? "recorded message" : "recorded messages"}`}
              actions={result.item.status !== "open" ? <Badge variant="neutral">{result.item.status}</Badge> : undefined}
            />
            <ConversationThread
              conversationId={conversationId}
              messages={result.item.messages}
              disabled={result.mode !== "ready" || result.item.status !== "open"}
              presentation="owner"
            />
          </>
        )}
      </div>
    </OwnerShell>
  );
}
