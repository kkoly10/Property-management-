import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OperatorAttentionItem = {
  title: ReactNode;
  meta?: ReactNode;
  href?: string;
  status?: ReactNode;
  visual?: ReactNode;
  priority?: "critical" | "high" | "medium" | "low" | "neutral";
};

const priorityClass: Record<NonNullable<OperatorAttentionItem["priority"]>, string> = {
  critical: "bg-destructive",
  high: "bg-[#e5484d]",
  medium: "bg-[#f59e0b]",
  low: "bg-info",
  neutral: "bg-border-strong",
};

/**
 * Operator-specific unresolved-work rail.
 *
 * This is intentionally a list/queue, not a stack of cards. Crecy OS should feel
 * like an operating desk: the visual hierarchy comes from urgency, chronology,
 * and the work itself rather than decorative containers.
 */
export function OperatorAttentionRail({
  items,
  empty,
  className,
}: {
  items: OperatorAttentionItem[];
  empty?: ReactNode;
  className?: string;
}) {
  if (!items.length) return <>{empty ?? null}</>;

  return (
    <div className={cn("divide-y", className)}>
      {items.map((item, index) => {
        const content = (
          <div className="group relative grid min-w-0 grid-cols-[4px_minmax(0,1fr)_auto] gap-x-4 px-1 py-4 transition-colors hover:bg-[var(--brand-subtle)] sm:px-2">
            <span
              aria-hidden="true"
              className={cn(
                "row-span-2 h-full min-h-10 w-1 rounded-full",
                priorityClass[item.priority ?? "neutral"],
              )}
            />
            {item.priority && item.priority !== "neutral" ? (
              <span className="sr-only">Priority: {item.priority}</span>
            ) : null}
            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-3">
                {item.visual ? <div className="shrink-0">{item.visual}</div> : null}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">{item.title}</div>
                  {item.meta ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.meta}</div> : null}
                </div>
              </div>
            </div>
            {item.status ? <div className="self-start pl-3 text-xs">{item.status}</div> : null}
          </div>
        );

        return item.href ? (
          <Link
            key={index}
            href={item.href}
            className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </Link>
        ) : (
          <div key={index}>{content}</div>
        );
      })}
    </div>
  );
}
