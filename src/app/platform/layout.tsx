import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Wordmark } from "@/components/brand/wordmark";
import { getActiveSupportSessions } from "@/lib/data/platform-support";
import { SupportSessionBanner } from "./support-session-banner";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const activeSessions = await getActiveSupportSessions();
  return (
    <div className="min-h-screen bg-muted/30">
      <SupportSessionBanner sessions={activeSessions} />
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/platform" className="flex items-center gap-3">
            <Wordmark />
            <Badge variant="neutral">Platform</Badge>
          </Link>
          {/* /platform/support is a static segment, so Next resolves it ahead of the sibling
              [organizationId] route; organization ids are uuids and can never collide with it. */}
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/platform" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Overview</Link>
            <Link href="/platform/support" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Support</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-5 sm:py-8">{children}</main>
    </div>
  );
}
