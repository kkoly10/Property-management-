import Link from "next/link";
import { BellRing, FileLock2, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { OrganizationSwitcher } from "@/components/app/organization-switcher";
import { PrimaryNavigation } from "@/components/app/primary-navigation";
import { GlobalSearch } from "@/components/app/global-search";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperatorOrganization } from "@/lib/organization/context";

export function AppShell({
  organizationName,
  organizations,
  activeOrganizationId,
  switcherDisabled,
  children,
}: {
  organizationName: string;
  organizations: OperatorOrganization[];
  activeOrganizationId: string | null;
  switcherDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-5"><Wordmark /></div>
        <OrganizationSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          activeLabel={organizationName}
          disabled={switcherDisabled}
        />
        <PrimaryNavigation />
        <div className="border-t p-3">
          <Link href="/settings/payments" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="h-4 w-4" />Settings</Link>
          <Link href="/settings/team" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><UsersRound className="h-4 w-4" />Team access</Link>
          <Link href="/settings/notifications?returnTo=/app" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><BellRing className="h-4 w-4" />Notifications</Link>
          <Link href="/settings/privacy?returnTo=/app" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><FileLock2 className="h-4 w-4" />Privacy requests</Link>
          <div className="mt-2 flex items-center gap-3 rounded-md px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ecfdf3] text-success"><ShieldCheck className="h-4 w-4" /></span><span><span className="block text-sm font-medium">Secure session</span><span className="block text-xs text-muted-foreground">RLS enforced</span></span></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:gap-5 lg:px-8">
          <div className="shrink-0 lg:hidden"><Wordmark /></div>
          <div className="min-w-0 flex-1"><GlobalSearch /></div>
          <div className="hidden shrink-0 items-center gap-3 md:flex"><Badge variant="success">Growth trial</Badge><Button variant="outline" size="sm">Help</Button></div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
