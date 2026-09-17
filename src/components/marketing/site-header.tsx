import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { MARKETING_ROUTES } from "@/lib/marketing/navigation";

/**
 * The shared public header.
 *
 * It used to be a rigid three-track grid (`grid-cols-[1fr_auto_1fr]`) on a fixed `h-[4.5rem]` row.
 * That is fine until text is enlarged on its own — the layout browsers reach through "zoom text
 * only" rather than page zoom. Every length here is rem-based, so at 200% the wordmark, the five
 * links, both buttons and the two column gaps all double, the row has nowhere to put the extra
 * width, and the document overflows horizontally: +23px at 1280, +511px at 768.
 *
 * The fix is to let the bar behave like content instead of a fixed chrome strip:
 *
 *  - a wrapping flex row rather than three rigid tracks, so the navigation drops to its own line
 *    when it no longer fits beside the wordmark and the actions;
 *  - `min-h` instead of `h`, so the header grows taller rather than forcing its contents to
 *    overflow sideways;
 *  - equal `flex-1` groups either side of the nav, which reproduces what `1fr auto 1fr` was doing —
 *    the nav stays centred on the container, not merely between its neighbours;
 *  - the wordmark capped in px. It is a graphic, and text-only zoom should not scale a logo; in rem
 *    it grew to 256px and ate the phone header on its own. 128px/139px are the same rendered sizes
 *    the previous `8rem`/`8.7rem` produced at normal zoom.
 *
 * The desktop crossover moves from `md` (768px) to `lg` (1024px). At 768px the full desktop bar
 * already occupied 710 of 728 available pixels at NORMAL zoom — 97% full, with no slack for a
 * longer label, let alone enlarged text. Wrapping it there produced a 105px-tall tablet header for
 * no benefit; handing 768-1023px to the existing mobile menu keeps that range at its original 73px
 * and leaves the desktop bar only where it genuinely fits.
 *
 * The mobile disclosure is unchanged in behaviour. The checkbox stays a sibling that precedes the
 * panel, because `peer-checked:` only reaches forward; the panel moves from `top-[4.5rem]` to
 * `top-full` so it still sits directly beneath a header that is now allowed to be taller.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/96 backdrop-blur supports-[backdrop-filter]:bg-card/92">
      <div className="mx-auto flex min-h-[4.5rem] max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 lg:px-8">
        <input
          type="checkbox"
          id="marketing-menu"
          // `lg:hidden` keeps this out of the tab order above the crossover. Without it a desktop
          // keyboard user meets an "Open menu" stop for a control that is not on screen.
          className="peer sr-only lg:hidden"
          aria-label="Open menu"
          aria-controls="marketing-mobile-menu"
        />

        <div className="flex min-w-0 flex-1 items-center">
          <Link href="/" aria-label="Crecy home" className="w-fit">
            <Wordmark className="max-w-[128px] sm:max-w-[139px]" />
          </Link>
        </div>

        <nav aria-label="Primary" className="hidden min-w-0 flex-[2] flex-wrap items-center justify-center gap-x-8 gap-y-2 lg:flex">
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

        <div className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/signup">Start free</Link></Button>
        </div>

        <label
          htmlFor="marketing-menu"
          className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border lg:hidden"
        >
          <span className="sr-only">Menu</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </label>

        <div
          id="marketing-mobile-menu"
          className="absolute inset-x-0 top-full hidden border-b bg-card p-5 shadow-[var(--shadow-panel)] peer-checked:block lg:!hidden"
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
