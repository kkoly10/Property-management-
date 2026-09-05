import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CrecyVisualSurface = "os" | "living" | "owner";

/**
 * Explicit surface wrapper for route groups and previews.
 *
 * Production gets its default surface from the canonical host in the root layout.
 * Route shells may use this wrapper so local/Vercel previews still render the
 * correct product theme even though all preview hosts classify as development.
 */
export function SurfaceTheme({
  surface,
  children,
  className,
}: {
  surface: CrecyVisualSurface;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-crecy-surface={surface} className={cn("min-h-full", className)}>
      {children}
    </div>
  );
}
