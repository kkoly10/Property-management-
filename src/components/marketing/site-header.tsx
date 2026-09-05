import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { MARKETING_ROUTES } from "@/lib/marketing/navigation";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/96 backdrop-blur supports-[backdrop-filter]:bg-card/92">
      <div className="mx-auto grid h-[4.5rem] max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-5 lg:px-8">
        <Link href="/" aria-label="Crecy home" className="w-fit shrink-0">
          <Wordmark className="max-w-[8rem] sm:max-w-[8.7rem]" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {MARKETING_ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {route.label}
            </Link>
          ))}
        </nav>

        <div className="hidden justify-self-end items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
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
          className="col-start-3 justify-self-end inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border md:hidden"
        >
          <span className="sr-only">Menu</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </label>

        <div
          id="marketing-mobile-menu"
          className="absolute inset-x-0 top-[4.5rem] hidden border-b bg-card p-5 shadow-[var(--shadow-panel)] peer-checked:block md:!hidden"
        >
          <nav aria-label="Primary mobile" className="flex flex-col">
            {MARKETING_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="border-b px-1 py-3 text-base font-medium last:border-0">
                {route.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button asChild variant="outline"><Link href="/login">Sign in</Link></Button>
            <Button asChild><Link href="/signup">Start free</Link></Button>
          </div>
        </div>
      </div>
    </header>
  );
}
