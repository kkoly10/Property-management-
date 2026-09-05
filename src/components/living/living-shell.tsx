import Link from "next/link";
import { Bell, FileText, UserRound } from "lucide-react";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import { Wordmark } from "@/components/brand/wordmark";
import { LivingDesktopNavigation, LivingMobileNavigation } from "@/components/living/living-navigation";

export function LivingShell({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <SurfaceTheme surface="living" className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="min-h-screen pb-24 md:pb-0">
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <div className={`mx-auto flex h-16 ${maxWidth} items-center gap-5 px-4 sm:px-6`}>
            <div className="shrink-0">
              <Wordmark product="Living" className="max-w-[7.7rem] sm:max-w-[8.7rem]" />
            </div>

            <LivingDesktopNavigation />

            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/documents"
                aria-label="Documents"
                className="hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
              >
                <FileText aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" />
              </Link>
              <Link
                href="/more/preferences"
                aria-label="Notification preferences"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Bell aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" />
              </Link>
              <Link
                href="/more/preferences"
                aria-label="Resident preferences"
                className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-[var(--brand)] hover:text-foreground"
              >
                <UserRound aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" />
              </Link>
            </div>
          </div>
        </header>

        <main className={`mx-auto ${maxWidth} px-4 py-6 sm:px-6 sm:py-8`}>
          {children}
        </main>

        <LivingMobileNavigation />
      </div>
    </SurfaceTheme>
  );
}
