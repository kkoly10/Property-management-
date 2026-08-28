import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { MARKETING_ROUTES } from "@/lib/marketing/navigation";

/**
 * The public header.
 *
 * The mobile menu is a CSS-only disclosure (a checkbox and a sibling selector) rather than a client
 * component: this header is on every marketing page, and a static page should not ship JavaScript to
 * open a list of five links.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 lg:px-8">
        <Link href="/" aria-label="Crecy home" className="shrink-0"><Wordmark /></Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-7 md:flex">
          {MARKETING_ROUTES.map((route) => (
            <Link key={route.href} href={route.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {route.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Log in</Link></Button>
          <Button asChild size="sm"><Link href="/signup">Start free</Link></Button>
        </div>

        <input
          type="checkbox"
          id="marketing-menu"
          className="peer sr-only md:hidden"
          aria-label="Open menu"
          aria-controls="marketing-mobile-menu"
        />
        <label
          htmlFor="marketing-menu"
          className="ml-auto inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border text-sm md:hidden"
        >
          <span className="sr-only">Menu</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </label>

        <div
          id="marketing-mobile-menu"
          className="absolute inset-x-0 top-16 hidden border-b bg-card p-5 shadow-sm peer-checked:block md:!hidden"
        >
          <nav aria-label="Primary mobile" className="flex flex-col gap-1">
            {MARKETING_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="rounded-lg px-3 py-2.5 text-base font-medium hover:bg-muted">
                {route.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Button asChild variant="outline"><Link href="/login">Log in</Link></Button>
            <Button asChild><Link href="/signup">Start free</Link></Button>
          </div>
        </div>
      </div>
    </header>
  );
}
