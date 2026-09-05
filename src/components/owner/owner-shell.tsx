import Link from "next/link";
import { Bell, FileText, MessageSquareText } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import { OwnerNavigation } from "@/components/owner/owner-navigation";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  return (
    <SurfaceTheme surface="owner" className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="min-h-screen lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="hidden min-h-screen border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="flex h-[4.5rem] items-center border-b px-5">
            <Wordmark product="Owner" className="max-w-[8.8rem]" />
          </div>

          <div className="px-5 py-5">
            <p className="text-[0.7rem] font-medium text-muted-foreground">OWNER PORTAL</p>
            <p className="mt-1 text-sm font-semibold tracking-[-0.01em] text-foreground">Financial visibility</p>
          </div>

          <OwnerNavigation />

          <div className="mt-auto border-t px-4 py-4">
            <p className="text-xs leading-5 text-muted-foreground">
              Statements and remittances reflect finalized records supplied by your property operator.
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
            <div className="mx-auto flex h-[4.5rem] max-w-[1380px] items-center gap-4 px-4 sm:px-6 lg:px-8">
              <div className="shrink-0 lg:hidden">
                <Wordmark product="Owner" className="max-w-[8rem]" />
              </div>

              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">Owner Dashboard</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Statements, distributions, and approvals</p>
              </div>

              <div className="ml-auto flex items-center gap-1">
                <Link href="/owner/messages" aria-label="Owner messages" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <MessageSquareText aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" />
                </Link>
                <Link href="/owner/documents" aria-label="Owner documents" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <FileText aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" />
                </Link>
                <Link href="/owner/preferences" aria-label="Owner preferences" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Bell aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" />
                </Link>
              </div>
            </div>
            <div className="lg:hidden"><OwnerNavigation compact /></div>
          </header>

          <main className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
        </div>
      </div>
    </SurfaceTheme>
  );
}
