"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A horizontal navigation rail that tells the truth about itself.
 *
 * A bare `overflow-x-auto` strip fails on a phone in three separate ways, and the owner portal was
 * failing all three: four of its seven destinations sat past the right edge, the strip carried no
 * visual sign that it scrolled at all, and — worst — it always opened at `scrollLeft: 0`, so on
 * `/owner/documents` the rail showed "Overview · Statements · Distributions" with nothing marked
 * current. The page you were on was the one piece of information the navigation withheld.
 *
 * Three fixes, in the order they matter:
 *
 *   1. **Bring the current item into view.** Done by arithmetic on `scrollLeft` rather than
 *      `scrollIntoView()`, which is free to scroll every ancestor including the document — landing
 *      the reader halfway down the page on arrival. Adjusting this element's own scroll offset
 *      cannot move anything else.
 *   2. **Say that it scrolls.** Edge fades are the affordance that needs no learning: a soft
 *      gradient where content continues, nothing where it does not. They are `aria-hidden` and
 *      `pointer-events-none`, so they add decoration and no obstacle.
 *   3. **Land on an item, not between two.** `scroll-snap-type: x proximity` — proximity rather
 *      than mandatory, so a deliberate flick past several tabs is not fought by the browser.
 *
 * Scrolling remains a real scroll: every tab is a link in the DOM, reachable by keyboard tabbing and
 * announced by a screen reader in source order whether or not it is currently painted.
 */
export function ScrollRail({
  label,
  className,
  contentClassName,
  children,
}: {
  label: string;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const pathname = usePathname();

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    // A 1px tolerance: fractional layout widths mean `scrollLeft` rarely reaches `max` exactly, and
    // a fade that never quite turns off reads as a rendering fault.
    setEdges({ start: rail.scrollLeft > 1, end: rail.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const railRect = rail.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const delta = activeRect.left - railRect.left - (railRect.width - activeRect.width) / 2;
      // Centre it, clamped by the browser to the scrollable range. No smooth behaviour: this runs on
      // first paint and on every navigation, where an animated jump reads as the page moving by
      // itself — and `prefers-reduced-motion` asks us not to do that at all.
      rail.scrollLeft += delta;
    }
    measure();
  }, [pathname, measure]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={railRef}
        onScroll={measure}
        className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", contentClassName)}
        style={{ scrollSnapType: "x proximity" }}
      >
        <nav aria-label={label} className="flex min-w-max">
          {children}
        </nav>
      </div>
      <span
        aria-hidden="true"
        data-visible={edges.start || undefined}
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent opacity-0 transition-opacity data-[visible]:opacity-100"
      />
      <span
        aria-hidden="true"
        data-visible={edges.end || undefined}
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent opacity-0 transition-opacity data-[visible]:opacity-100"
      />
    </div>
  );
}
