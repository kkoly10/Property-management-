import Link from "next/link";
import {
  Bell,
  CircleHelp,
  FileLock2,
  LayoutDashboard,
  Settings,
  UsersRound,
} from "lucide-react";
import { OrganizationSwitcher } from "@/components/app/organization-switcher";
import { MobileNavigation } from "@/components/app/mobile-navigation";
import { PrimaryNavigation } from "@/components/app/primary-navigation";
import { GlobalSearch } from "@/components/app/global-search";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import type { OperatorOrganization } from "@/lib/organization/context";

function UtilityLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Settings;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-r-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

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
    <div className="min-h-screen bg-[var(--surface-canvas)] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-[4.5rem] items-center border-b px-5">
          <Wordmark className="max-w-[8.8rem]" />
        </div>

        <OrganizationSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          activeLabel={organizationName}
          disabled={switcherDisabled}
        />

        <div className="flex min-h-0 flex-1 flex-col pt-4">
          <PrimaryNavigation />
        </div>

        <div className="border-t px-3 py-3">
          <div className="space-y-0.5">
            <UtilityLink href="/settings/payments" label="Settings" icon={Settings} />
            <UtilityLink href="/settings/team" label="Team access" icon={UsersRound} />
            <UtilityLink href="/settings/notifications?returnTo=/app" label="Notifications" icon={Bell} />
            <UtilityLink href="/settings/privacy?returnTo=/app" label="Privacy requests" icon={FileLock2} />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t px-3 pt-3 text-xs text-muted-foreground">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
            <span>Secure operator session</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* One row on every screen. It used to stack the wordmark above the search field and then
            carry the thirteen-section scrolling rail beneath both, which measured 156px on a 390px
            phone — 18% of an iPhone 14 viewport and 23% of an SE, consumed before any content.
            Moving navigation to the bottom bar leaves a single 72px row. */}
        <header className="sticky top-0 z-30 border-b bg-card/96 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <div className="flex min-h-[4.5rem] items-center gap-3 gutter-4 py-3 sm:gap-4 lg:gutter-7 lg:py-0 xl:gutter-8">
            <div className="shrink-0 lg:hidden">
              <Wordmark className="max-w-[6.25rem] sm:max-w-[7.5rem]" />
            </div>

            <div className="hidden shrink-0 items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-foreground xl:flex">
              <LayoutDashboard aria-hidden="true" className="h-4 w-4 text-primary" />
              <span>Operator Dashboard</span>
            </div>

            <div className="min-w-0 flex-1">
              <GlobalSearch />
            </div>

            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Badge variant="success" className="hidden xl:inline-flex">Growth trial</Badge>
              <Link
                href="/settings/notifications?returnTo=/app"
                aria-label="Notification settings"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" />
              </Link>
              <Link
                href="/security"
                aria-label="Help and security"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CircleHelp aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" />
              </Link>
            </div>
          </div>

        </header>

        <main className="min-w-0 max-w-full gutter-4 py-6 sm:gutter-6 lg:gutter-7 lg:py-7 xl:gutter-8">{children}</main>

        {/* Everything the `lg` sidebar holds — the thirteen sections, the five account destinations
            and the organization switcher — reaches a phone through here. Below `lg` this is the
            only operator navigation that exists, which is why it carries the switcher rather than
            leaving multi-organization operators stranded in whichever context they last used on a
            desktop. The switcher is built on the server and handed down, so its server action is
            unchanged; `variant="sheet"` only keeps its test ids distinct from the sidebar copy. */}
        <MobileNavigation
          organizationSwitcher={
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
              activeLabel={organizationName}
              disabled={switcherDisabled}
              variant="sheet"
            />
          }
        />
      </div>
    </div>
  );
}
