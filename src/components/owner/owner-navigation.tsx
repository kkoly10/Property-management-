"use client";

import Link from "next/link";
import {
  Bell,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Gauge,
  Menu,
  MessageSquareText,
  ShieldCheck,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
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
  if (href === "/owner#statements") return pathname.startsWith("/owner/statements");
  if (href === "/owner#remittances") return false;
  if (href === "/owner#approvals") return pathname.startsWith("/owner/approvals");
  return pathname.startsWith(href);
}

export function OwnerNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  if (compact) {
    const primary = items.filter((item) => ["Overview", "Statements", "Approvals", "Messages"].includes(item.label));
    const overflow = items.filter((item) => !primary.includes(item));
    const activeOverflow = overflow.find((item) => active(pathname, item.href));

    const tabClass = (current: boolean) => cn(
      "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-[0.68rem] font-medium leading-tight transition-colors",
      current ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

    return (
      <>
        <nav
          aria-label="Owner navigation"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/96 pb-[max(.5rem,env(safe-area-inset-bottom))] pl-[calc(.5rem+env(safe-area-inset-left))] pr-[calc(.5rem+env(safe-area-inset-right))] pt-1.5 backdrop-blur print:hidden lg:hidden"
        >
          <div className="mx-auto flex max-w-md items-stretch">
            {primary.map(({ label, href, icon: Icon }) => {
              const current = active(pathname, href);
              return (
                <Link key={href} href={href} aria-current={current ? "page" : undefined} className={tabClass(current)}>
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              );
            })}

            <Dialog.Root>
              <Dialog.Trigger
                className={tabClass(Boolean(activeOverflow))}
                aria-current={activeOverflow ? "page" : undefined}
              >
                <Menu aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate">{activeOverflow?.label ?? "More"}</span>
              </Dialog.Trigger>

              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-[2px]" />
                <Dialog.Content
                  aria-describedby={undefined}
                  className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t bg-[var(--surface-canvas)] pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,.18)] focus:outline-none"
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[var(--surface-canvas)] gutter-5 py-3.5">
                    <Dialog.Title className="text-sm font-semibold tracking-[-0.01em]">Owner sections</Dialog.Title>
                    <Dialog.Close
                      aria-label="Close navigation"
                      className="flex h-11 w-11 -mr-2.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X aria-hidden="true" className="h-5 w-5" />
                    </Dialog.Close>
                  </div>
                  <div className="gutter-5 py-4">
                    <div className="overflow-hidden rounded-xl border bg-card">
                      {overflow.map(({ label, href, icon: Icon }) => {
                        const current = active(pathname, href);
                        return (
                          <Dialog.Close asChild key={href}>
                            <Link
                              href={href}
                              aria-current={current ? "page" : undefined}
                              className={cn(
                                "flex min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium transition-colors [&+&]:border-t",
                                current ? "bg-[var(--brand-subtle)] text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                              )}
                            >
                              <Icon aria-hidden="true" className={cn("h-[1.05rem] w-[1.05rem] shrink-0", current && "text-primary")} />
                              <span>{label}</span>
                            </Link>
                          </Dialog.Close>
                        );
                      })}
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </nav>
      </>
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
