import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { LEGAL_ROUTES, MARKETING_ROUTES } from "@/lib/marketing/navigation";

/**
 * The public footer.
 *
 * Deliberately free of the things file 18 prohibits: no customer logos, no counts, no certification
 * badges, no uptime figure. The availability line uses the spec's own approved wording — North America
 * is being PREPARED, which is true, rather than "available", which would need a launch checklist per
 * country that has not run.
 */
export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-6xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              A connected rental operations platform for landlords and property managers. Designed for the
              United States, Canada and Mexico.
            </p>
          </div>

          <nav aria-label="Footer product">
            <h2 className="text-sm font-semibold">Platform</h2>
            <ul className="mt-4 space-y-2.5">
              {MARKETING_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link href={route.href} className="text-sm text-muted-foreground hover:text-foreground">{route.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer account and legal">
            <h2 className="text-sm font-semibold">Account &amp; legal</h2>
            <ul className="mt-4 space-y-2.5">
              <li><Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Log in</Link></li>
              <li><Link href="/signup" className="text-sm text-muted-foreground hover:text-foreground">Start free</Link></li>
              {LEGAL_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link href={route.href} className="text-sm text-muted-foreground hover:text-foreground">{route.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Crecy. All rights reserved.</p>
          <p>North American availability is being prepared. Accessibility target: WCAG 2.2 AA.</p>
        </div>
      </div>
    </footer>
  );
}
