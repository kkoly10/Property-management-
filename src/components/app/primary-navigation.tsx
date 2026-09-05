"use client";

import Link from "next/link";
import {
  Building2,
  CircleGauge,
  CreditCard,
  FileSignature,
  FileText,
  HardHat,
  Landmark,
  Megaphone,
  MessageSquareText,
  Upload,
  Users,
  Wrench,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const overview = { label: "Overview", href: "/app", icon: CircleGauge } as const;

const groups = [
  {
    label: "Portfolio",
    items: [
      { label: "Properties", href: "/app/properties", icon: Building2 },
      { label: "Residents", href: "/app/residents", icon: Users },
      { label: "Leases", href: "/app/leases", icon: FileSignature },
      { label: "Imports", href: "/app/imports", icon: Upload },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Maintenance", href: "/app/maintenance", icon: Wrench },
      { label: "Vendors", href: "/app/vendors", icon: HardHat },
      { label: "Messages", href: "/app/messages", icon: MessageSquareText },
      { label: "Announcements", href: "/app/announcements", icon: Megaphone },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Payments", href: "/app/payments", icon: CreditCard },
      { label: "Owners", href: "/app/owners", icon: Landmark },
      { label: "Owner statements", href: "/app/owner-statements", icon: FileText },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Documents", href: "/app/documents", icon: FileText },
    ],
  },
] as const;

const mobileItems = [overview, ...groups.flatMap((group) => group.items)];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname.startsWith(href);
}

function NavigationLink({
  label,
  href,
  icon: Icon,
  compact = false,
}: {
  label: string;
  href: string;
  icon: typeof CircleGauge;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href);

  if (compact) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
          active
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-r-lg px-3 py-2 text-[0.875rem] font-medium transition-colors",
        "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent",
        active
          ? "bg-[var(--brand-subtle)] text-foreground before:bg-primary"
          : "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className={cn("h-[1.05rem] w-[1.05rem]", active && "text-primary")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function PrimaryNavigation({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <nav aria-label="Operator navigation" className="overflow-x-auto">
        <div className="flex min-w-max px-1">
          {mobileItems.map((item) => <NavigationLink key={item.href} {...item} compact />)}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
      <div className="mb-4">
        <NavigationLink {...overview} />
      </div>
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <div className="mb-1.5 px-3 text-[0.72rem] font-semibold tracking-[0.015em] text-muted-foreground/75">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => <NavigationLink key={item.href} {...item} />)}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}
