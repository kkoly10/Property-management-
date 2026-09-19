"use client";

import Link from "next/link";
import {
  Bell,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Gauge,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { cn } from "@/lib/utils";

type Item = { label: string; href: string; icon: LucideIcon };

const items: Item[] = [
  { label: "Overview", href: "/owner", icon: Gauge },
  { label: "Statements", href: "/owner#statements", icon: FileText },
  { label: "Distributions", href: "/owner#remittances", icon: CircleDollarSign },
  { label: "Approvals", href: "/owner#approvals", icon: FileCheck2 },
  { label: "Documents", href: "/owner/documents", icon: ShieldCheck },
  { label: "Messages", href: "/owner/messages", icon: MessageSquareText },
  { label: "Preferences", href: "/owner/preferences", icon: Bell },
];

function active(pathname: string, href: string) {
  if (href === "/owner") return pathname === "/owner";
  if (href === "/owner#statements") return pathname.startsWith("/owner/statements");
  if (href === "/owner#remittances") return false;
  if (href === "/owner#approvals") return pathname.startsWith("/owner/approvals");
  return pathname.startsWith(href);
}

export function OwnerNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  if (compact) {
    // Seven destinations need 694px. On a 390px phone that left Approvals, Documents, Messages and
    // Preferences off-screen with no sign they existed — and the rail opened at scroll position 0
    // regardless of where you were. A rail is the right shape for seven items; it just has to
    // scroll itself to the current one and admit that it scrolls. Thirteen items would not fit this
    // pattern at all, which is why the operator surface uses a bottom bar instead.
    return (
      <ScrollRail label="Owner navigation" className="border-t bg-card" contentClassName="px-1">
        {items.map(({ label, href }) => {
          const current = active(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              style={{ scrollSnapAlign: "start" }}
              className={cn(
                "relative shrink-0 px-3 py-3 text-sm font-medium transition-colors",
                current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {current ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
            </Link>
          );
        })}
      </ScrollRail>
    );
  }

  return (
    <nav aria-label="Owner navigation" className="space-y-0.5 px-3">
      {items.map(({ label, href, icon: Icon }) => {
        const current = active(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-r-lg px-3 py-2.5 text-sm font-medium transition-colors",
              "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent",
              current
                ? "bg-[var(--brand-subtle)] text-foreground before:bg-primary"
                : "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className={cn("h-4 w-4", current && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
