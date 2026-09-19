"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  Bell,
  Building2,
  CircleHelp,
  CreditCard,
  FileLock2,
  Menu,
  Settings,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { groups, isActive, overview, type NavigationItem } from "@/components/app/primary-navigation";
import { cn } from "@/lib/utils";

/**
 * The operator navigation for every screen narrower than the `lg` sidebar.
 *
 * ── Why this replaced the scrolling rail ─────────────────────────────────────────────────────────
 *
 * The phone header used to carry all thirteen sections in a single `overflow-x-auto` strip 1567px
 * wide. On a 390px screen that showed three and hid ten, with no fade, no snap and no attempt to
 * scroll the current section into view — so opening Payments produced a bar reading
 * "Overview · Properties · Residents" with nothing highlighted. Worse, the six account destinations
 * (Settings, Team access, Notifications, Privacy requests, Help) and the organization switcher lived
 * only inside the `lg:flex` sidebar and therefore did not exist on a phone at any tap count: an
 * operator could not reach billing, invite a colleague, or change organization from their phone.
 *
 * ── Why a bottom bar plus a sheet, rather than a drawer ──────────────────────────────────────────
 *
 * Nielsen Norman Group tested 179 users across six sites: navigation was used in 86-89% of tasks
 * where some destinations were visible and the rest collapsed ("combo"), against 44-57% where
 * everything sat behind a hamburger, and time-to-first-navigation was 21-24s against 33s. Their
 * separate study puts the cost of fully hidden navigation at 21% of task completion. So: expose
 * some, collapse the rest — never all of one or all of the other. A tab bar holds three to seven
 * items before the labels stop being legible, which is why four plus More and not six plus More.
 *
 * It sits at the bottom because that is where thumbs are: roughly three quarters of people operate a
 * phone one-handed, and the reachable arc on a modern screen is the bottom third. It also matches
 * Crecy Living, whose bottom bar already works, so the two surfaces stop behaving differently.
 *
 * ── The part that is easy to get wrong ───────────────────────────────────────────────────────────
 *
 * "More" is not a dumb overflow. When the section you are in lives inside the sheet, the More tab
 * takes the active styling AND its own label, so the bar always answers "where am I?" — the single
 * question the old rail refused to answer. Getting that wrong would reproduce the original defect
 * behind a nicer control.
 */
const PRIMARY: NavigationItem[] = [
  overview,
  { label: "Properties", href: "/app/properties", icon: Building2 },
  { label: "Maintenance", href: "/app/maintenance", icon: Wrench },
  { label: "Payments", href: "/app/payments", icon: CreditCard },
];

/**
 * Account and workspace destinations. These are the sidebar's footer links; the phone had no
 * equivalent at all. `returnTo` is preserved exactly as the sidebar sends it so the back journey
 * from a settings screen is unchanged.
 */
const UTILITIES: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Settings", href: "/settings/payments", icon: Settings },
  { label: "Team access", href: "/settings/team", icon: UsersRound },
  { label: "Notifications", href: "/settings/notifications?returnTo=/app", icon: Bell },
  { label: "Privacy requests", href: "/settings/privacy?returnTo=/app", icon: FileLock2 },
  { label: "Help and security", href: "/security", icon: CircleHelp },
];

const SECONDARY = groups
  .map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !PRIMARY.some((primary) => primary.href === item.href)),
  }))
  .filter((group) => group.items.length > 0);

export function MobileNavigation({ organizationSwitcher }: { organizationSwitcher?: React.ReactNode }) {
  const pathname = usePathname();

  const activePrimary = PRIMARY.find((item) => isActive(pathname, item.href));
  const activeSecondary = SECONDARY.flatMap((group) => group.items).find((item) => isActive(pathname, item.href));
  const moreLabel = activePrimary ? "More" : activeSecondary?.label ?? "More";

  const tabClass = (active: boolean) => cn(
    // `min-h-14` keeps every tab comfortably past the 24px WCAG 2.2 floor and close to the 44px
    // recommendation. The padding and type size are the measured values at which the longest label,
    // "Maintenance", stops being cut: at 360px each slot offers 67px of label and the word needs 66.
    // At 320px — an iPhone SE 1st generation — it is still three pixels over and ellipsises; the
    // wrench above it and the active colour carry the meaning there, and shortening the word for
    // every phone to satisfy the narrowest one would put two names on one section.
    "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-[0.66rem] font-medium leading-tight transition-colors",
    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
  );

  return (
    <>
      <nav
        aria-label="Operator navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/96 pb-[max(.5rem,env(safe-area-inset-bottom))] pl-[calc(.5rem+env(safe-area-inset-left))] pr-[calc(.5rem+env(safe-area-inset-right))] pt-1.5 backdrop-blur print:hidden lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch">
          {PRIMARY.map(({ label, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}

          <Dialog.Root>
            <Dialog.Trigger className={tabClass(!activePrimary)} aria-current={!activePrimary ? "page" : undefined}>
              <Menu aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{moreLabel}</span>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-[2px]" />
              <Dialog.Content
                aria-describedby={undefined}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t bg-[var(--surface-canvas)] pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,.18)] focus:outline-none"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[var(--surface-canvas)] gutter-5 py-3.5">
                  <Dialog.Title className="text-sm font-semibold tracking-[-0.01em]">All sections</Dialog.Title>
                  <Dialog.Close
                    aria-label="Close navigation"
                    className="flex h-11 w-11 -mr-2.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden="true" className="h-5 w-5" />
                  </Dialog.Close>
                </div>

                <div className="space-y-5 gutter-5 py-4">
                  {organizationSwitcher}

                  {SECONDARY.map((group) => (
                    <section key={group.label} aria-label={group.label}>
                      <h3 className="px-1 text-[0.72rem] font-semibold tracking-[0.015em] text-muted-foreground/75">{group.label}</h3>
                      <div className="mt-1.5 overflow-hidden rounded-xl border bg-card">
                        {group.items.map(({ label, href, icon: Icon }) => <SheetLink key={href} label={label} href={href} icon={Icon} pathname={pathname} />)}
                      </div>
                    </section>
                  ))}

                  <section aria-label="Workspace">
                    <h3 className="px-1 text-[0.72rem] font-semibold tracking-[0.015em] text-muted-foreground/75">Workspace</h3>
                    <div className="mt-1.5 overflow-hidden rounded-xl border bg-card">
                      {UTILITIES.map(({ label, href, icon: Icon }) => <SheetLink key={href} label={label} href={href} icon={Icon} pathname={pathname} />)}
                    </div>
                  </section>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </nav>

      {/* The bar is fixed, so it does not reserve its own space. Without this the last control on
          every operator page would sit underneath it. Mirrors the `pb-24` Crecy Living already uses. */}
      <div aria-hidden="true" className="h-20 print:hidden lg:hidden" />
    </>
  );
}

function SheetLink({ label, href, icon: Icon, pathname }: { label: string; href: string; icon: LucideIcon; pathname: string }) {
  const active = isActive(pathname, href.split("?")[0]);
  return (
    <Dialog.Close asChild>
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium transition-colors [&+&]:border-t",
        active ? "bg-[var(--brand-subtle)] text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className={cn("h-[1.05rem] w-[1.05rem] shrink-0", active && "text-primary")} />
      <span className="truncate">{label}</span>
    </Link>
    </Dialog.Close>
  );
}
