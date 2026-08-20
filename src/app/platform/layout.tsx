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
            <Badge variant="neutral">Platform support</Badge>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-5 sm:py-8">{children}</main>
    </div>
  );
}
