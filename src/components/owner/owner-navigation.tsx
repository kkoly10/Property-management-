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
  if (href.startsWith("/owner#")) return pathname === "/owner";
  return pathname.startsWith(href);
}

export function OwnerNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  if (compact) {
    return (
      <nav aria-label="Owner navigation" className="overflow-x-auto border-t">
        <div className="flex min-w-max px-1">
          {items.map(({ label, href }) => {
            const current = active(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current && href === "/owner" ? "page" : undefined}
                className={cn(
                  "relative px-3 py-3 text-sm font-medium transition-colors",
                  current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {current && href === "/owner" ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>
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
            aria-current={current && href === "/owner" ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-r-lg px-3 py-2.5 text-sm font-medium transition-colors",
              "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent",
              current && href === "/owner"
                ? "bg-[var(--brand-subtle)] text-foreground before:bg-primary"
                : "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className={cn("h-4 w-4", current && href === "/owner" && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
