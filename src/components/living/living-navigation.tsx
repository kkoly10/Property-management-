"use client";

import Link from "next/link";
import { CreditCard, Home, MessageSquareText, MoreHorizontal, Plus, Wrench } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const desktopItems = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Payments", href: "/payments/new", icon: CreditCard },
  { label: "Requests", href: "/maintenance", icon: Wrench },
  { label: "Messages", href: "/messages", icon: MessageSquareText },
  { label: "More", href: "/more/preferences", icon: MoreHorizontal },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/payments/new") return pathname.startsWith("/payments") || pathname.startsWith("/receipts");
  if (href === "/maintenance") return pathname.startsWith("/maintenance");
  if (href === "/messages") return pathname.startsWith("/messages");
  return pathname.startsWith("/more") || pathname.startsWith("/documents") || pathname.startsWith("/settings/privacy");
}

export function LivingDesktopNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Crecy Living" className="hidden items-stretch self-stretch md:flex">
      {desktopItems.map(({ label, href }) => {
        const active = activeFor(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center px-3.5 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function LivingMobileNavigation() {
  const pathname = usePathname();

  const itemClass = (active: boolean) => cn(
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1 text-[0.68rem] font-medium transition-colors",
    active ? "text-primary" : "text-muted-foreground",
  );

  return (
    <nav
      aria-label="Resident"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/96 px-2 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end">
        <Link href="/home" aria-current={pathname === "/home" ? "page" : undefined} className={itemClass(pathname === "/home")}>
          <Home aria-hidden="true" className="h-5 w-5" />
          Home
        </Link>
        <Link
          href="/payments/new"
          aria-current={activeFor(pathname, "/payments/new") ? "page" : undefined}
          className={itemClass(activeFor(pathname, "/payments/new"))}
        >
          <CreditCard aria-hidden="true" className="h-5 w-5" />
          Payments
        </Link>

        <Link
          href="/maintenance/new"
          aria-label="New maintenance request"
          className="relative -mt-7 flex flex-col items-center gap-1 text-[0.68rem] font-semibold text-primary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(6,118,71,.24)]">
            <Plus aria-hidden="true" className="h-5 w-5" />
          </span>
          Request
        </Link>

        <Link
          href="/messages"
          aria-current={activeFor(pathname, "/messages") ? "page" : undefined}
          className={itemClass(activeFor(pathname, "/messages"))}
        >
          <MessageSquareText aria-hidden="true" className="h-5 w-5" />
          Messages
        </Link>
        <Link
          href="/more/preferences"
          aria-current={activeFor(pathname, "/more/preferences") ? "page" : undefined}
          className={itemClass(activeFor(pathname, "/more/preferences"))}
        >
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
          More
        </Link>
      </div>
    </nav>
  );
}
