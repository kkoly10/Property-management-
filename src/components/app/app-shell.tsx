import Link from "next/link";
import { ChevronDown, FileLock2, LayoutGrid, Settings, ShieldCheck } from "lucide-react";
import { PrimaryNavigation } from "@/components/app/primary-navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppShell({ organizationName, children }: { organizationName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-5"><Wordmark /></div>
        <div className="px-3 py-4">
          <button className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-xs">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground"><LayoutGrid className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{organizationName}</span><span className="block text-xs text-muted-foreground">Operator workspace</span></span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <PrimaryNavigation />
        <div className="border-t p-3">
          <Link href="/settings/payments" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="h-4 w-4" />Settings</Link>
          <Link href="/settings/privacy?returnTo=/app" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><FileLock2 className="h-4 w-4" />Privacy requests</Link>
          <div className="mt-2 flex items-center gap-3 rounded-md px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ecfdf3] text-success"><ShieldCheck className="h-4 w-4" /></span><span><span className="block text-sm font-medium">Secure session</span><span className="block text-xs text-muted-foreground">RLS enforced</span></span></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-5 backdrop-blur lg:px-8">
          <div className="lg:hidden"><Wordmark /></div>
          <div className="hidden text-sm text-muted-foreground lg:block">Command center</div>
          <div className="flex items-center gap-3"><Badge variant="success">Growth trial</Badge><Button variant="outline" size="sm">Help</Button></div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
