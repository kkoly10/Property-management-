import Link from "next/link";
import { ArrowRight, Building2, CircleAlert, History, Search, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupportConsoleState } from "@/lib/data/platform-support";

export const dynamic = "force-dynamic";

export default async function PlatformConsolePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : undefined;
  const state = await getSupportConsoleState(query);

  if (state.mode === "forbidden") {
    return (
      <Alert variant="destructive">
        <CircleAlert className="h-5 w-5" />
        <AlertTitle>Not a platform support actor</AlertTitle>
        <AlertDescription>This console is limited to provisioned platform support actors. If you need access, ask a platform administrator to provision your account.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Platform support</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Support console</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Look up a customer organization and open an audited, time-boxed support session to view sanitized, read-only diagnostics. Support access never mutates customer data.
        </p>
      </div>

      {state.mode === "setup" ? (
        <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Support console preview</AlertTitle><AlertDescription>This sample renders until Supabase is connected and your account is provisioned as a platform actor.</AlertDescription></Alert>
      ) : null}
      {state.mode === "error" ? (
        <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Console unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {state.requestId}.</AlertDescription></Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><CardTitle>Find an organization</CardTitle></div><CardDescription>Search by name or workspace URL, then open a session to investigate.</CardDescription></CardHeader>
        <CardContent className="pt-5">
          <form action="/platform" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2"><Label htmlFor="q">Organization</Label><Input id="q" name="q" defaultValue={query ?? ""} placeholder="Northstar, or northstar" /></div>
            <Button type="submit">Search</Button>
          </form>
          <div className="mt-5 divide-y">
            {state.organizations.length ? state.organizations.map((org) => (
              <Link key={org.organizationId} href={`/platform/${org.organizationId}`} className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-muted/40">
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Building2 className="h-4 w-4" /></span>
                  <span><span className="block font-semibold">{org.displayName}</span><span className="block text-xs text-muted-foreground">{org.slug} · {org.status}</span></span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">No organizations matched.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><CardTitle>Support session history</CardTitle></div><CardDescription>Your sessions (platform administrators see every actor&apos;s sessions).</CardDescription></CardHeader>
        <CardContent className="p-0">
          {state.sessions.length ? (
            <div className="divide-y">{state.sessions.map((session) => (
              <div key={session.supportSessionId} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{session.organizationName ?? session.organizationId}</span><Badge variant={session.status === "active" ? "warning" : "neutral"}>{session.status}</Badge></p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{session.reason}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{session.startedAt ? new Date(session.startedAt).toLocaleString() : ""}{session.expiresAt ? ` → ${new Date(session.expiresAt).toLocaleTimeString()}` : ""}</p>
              </div>
            ))}</div>
          ) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No support sessions yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
