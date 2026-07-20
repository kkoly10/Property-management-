"use client";

import Link from "next/link";
import { Building2, CircleGauge, CreditCard, FileSignature, FileText, Upload, Users, Wrench } from "lucide-react";
import { usePathname } from "next/navigation";

const navigation = [
  { label: "Overview", href: "/app", icon: CircleGauge },
  { label: "Portfolio", href: "/app/properties", icon: Building2 },
  { label: "Imports", href: "/app/imports", icon: Upload },
  { label: "Residents", href: "/app/residents", icon: Users },
  { label: "Leases", href: "/app/leases", icon: FileSignature },
  { label: "Payments", href: "/app/payments", icon: CreditCard },
  { label: "Maintenance", href: "/app", icon: Wrench },
  { label: "Documents", href: "/app/documents", icon: FileText },
] as const;

export function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex-1 space-y-1 px-3">
      {navigation.map(({ label, href, icon: Icon }) => {
        const active = label === "Overview" ? pathname === href : href !== "/app" && pathname.startsWith(href);
        return (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon aria-hidden="true" className="h-4 w-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
