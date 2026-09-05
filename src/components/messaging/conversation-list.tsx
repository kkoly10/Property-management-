import Link from "next/link";
import { ArrowRight, MessageSquareText } from "lucide-react";
import type { ConversationSummary } from "@/lib/data/messaging";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const timestamp = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value));

export function ConversationList({
  items,
  routeBase,
  presentation = "default",
}: {
  items: ConversationSummary[];
  routeBase: string;
  presentation?: "default" | "living";
}) {
  if (!items.length) {
    if (presentation === "living") {
      return (
        <div className="rounded-[1.05rem] border bg-card px-6 py-12 text-center">
          <MessageSquareText aria-hidden="true" className="mx-auto h-7 w-7 text-primary" />
          <h2 className="mt-4 font-semibold">No conversations yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Messages from your property team will appear here when a conversation is connected to your home.</p>
        </div>
      );
    }

    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquareText aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">No conversations yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">A conversation appears when an active resident or owner relationship is connected.</p>
        </CardContent>
      </Card>
    );
  }

  if (presentation === "living") {
    return (
      <div className="overflow-hidden rounded-[1.05rem] border bg-card">
        <div className="divide-y">
          {items.map((item) => (
            <Link
              key={item.conversationId}
              href={`${routeBase}/${item.conversationId}`}
              className="group grid gap-3 px-5 py-5 transition-colors hover:bg-[var(--brand-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold tracking-[-0.01em] group-hover:text-primary">{item.audienceLabel}</h2>
                  {item.status !== "open" ? <Badge variant="neutral">{item.status}</Badge> : null}
                </div>
                <p className="mt-1 truncate text-sm text-foreground/80">{item.latestMessage?.bodyText ?? "No messages yet"}</p>
                <p className="mt-2 text-xs text-muted-foreground">{item.propertyName ?? item.subject} · {timestamp(item.updatedAt)}</p>
              </div>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <Link key={item.conversationId} href={`${routeBase}/${item.conversationId}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <Card className="transition-colors hover:bg-muted/30">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <MessageSquareText aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold">{item.audienceLabel}</h2>
                  {item.status !== "open" ? <Badge variant="neutral">{item.status}</Badge> : null}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {item.latestMessage?.bodyText ?? "No messages yet"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.propertyName ?? item.subject} · {timestamp(item.updatedAt)}
                </p>
              </div>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
