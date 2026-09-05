import Link from "next/link";
import { ArrowRight, Building2, CircleAlert, Clock, Home, KeyRound, LifeBuoy, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBusinessOverview } from "@/lib/data/platform-business";

export const dynamic = "force-dynamic";

const money = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

const whole = (value: number) => new Intl.NumberFormat("en-US").format(value);

function when(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function daysUntil(value: string | null): string {
  if (!value) return "no end date";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "already lapsed";
  if (days === 0) return "ends today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Building2; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon aria-hidden="true" className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-[0.08em]">{label}</span></div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A {key: count} map rendered as badges, ordered biggest first so the eye lands on what dominates. */
function Breakdown({ counts, empty }: { counts: Record<string, number>; empty: string }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, count]) => (
        <Badge key={key} variant="neutral">{key.replace(/_/g, " ")} · {whole(count)}</Badge>
      ))}
    </div>
  );
}

function MoneyRows({ label, byCurrency }: { label: string; byCurrency: Record<string, number> }) {
  const entries = Object.entries(byCurrency);
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums">
        {entries.length ? entries.map(([currency, total]) => <span key={currency} className="ml-3">{money(total, currency)}</span>) : "—"}
      </span>
    </div>
  );
}

export default async function PlatformOverviewPage() {
  const state = await getBusinessOverview();

  if (state.mode === "forbidden") {
    return (
      <Alert variant="destructive">
        <CircleAlert className="h-5 w-5" />
        <AlertTitle>Not a platform administrator</AlertTitle>
        <AlertDescription>This view aggregates every customer&apos;s numbers, so it is limited to platform administrators. Support agents can still use the support console.</AlertDescription>
      </Alert>
    );
  }

  if (state.mode === "mfa_required") {
    return (
      <Alert variant="warning">
        <ShieldCheck className="h-5 w-5" />
        <AlertTitle>Verify with MFA to continue</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Reading the whole platform&apos;s numbers requires a second factor. Verify once and this page will load.</p>
          <Button asChild size="sm"><Link href={`/settings/security/mfa?returnTo=${encodeURIComponent("/platform")}`}><KeyRound className="h-4 w-4" />Verify with MFA</Link></Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.mode === "error") {
    return (
      <Alert variant="destructive">
        <CircleAlert className="h-5 w-5" />
        <AlertTitle>Overview unavailable</AlertTitle>
        <AlertDescription>Refresh and try again. Request {state.requestId}.</AlertDescription>
      </Alert>
    );
  }

  const { overview } = state;
  const { customers, plans, portfolio, money: revenue, operations } = overview;
  const unhealthyNotifications = (operations.notificationJobsByStatus.dead_letter ?? 0) + (operations.notificationJobsByStatus.failed ?? 0);
  const needsAttention = unhealthyNotifications > 0 || operations.documentsQuarantined > 0 || (operations.chargeRunsByState.processing ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Platform</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">How Crecy is doing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every customer at once. To look inside one of them, open an audited support session from the{" "}
          <Link href="/platform/support" className="font-semibold text-primary hover:underline">support console</Link>.
          {overview.generatedAt ? <> Figures as of {when(overview.generatedAt)}.</> : null}
        </p>
      </div>

      {state.mode === "setup" ? (
        <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Sample data</AlertTitle><AlertDescription>This preview renders until Supabase is connected and your account is provisioned as a platform administrator.</AlertDescription></Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Building2} label="Customers" value={whole(customers.total)} hint={`${whole(customers.newLast30Days)} joined in the last 30 days`} />
        <Stat icon={Home} label="Units managed" value={whole(portfolio.units)} hint={`across ${whole(portfolio.properties)} propert${portfolio.properties === 1 ? "y" : "ies"}`} />
        <Stat icon={Users} label="Active tenancies" value={whole(portfolio.activeTenancies)} hint={`${whole(portfolio.activeStaff)} staff seats in use`} />
        <Stat icon={TrendingUp} label="New this week" value={whole(customers.newLast7Days)} hint="organizations created" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b"><CardTitle>Money through the ledger</CardTitle><CardDescription>What customers have actually billed and collected — not Crecy&apos;s own revenue.</CardDescription></CardHeader>
          <CardContent className="pt-4">
            <MoneyRows label="Billed" byCurrency={revenue.billedMinorByCurrency} />
            <MoneyRows label="Collected" byCurrency={revenue.collectedMinorByCurrency} />
            <MoneyRows label="Outstanding" byCurrency={revenue.outstandingMinorByCurrency} />
            <div className="mt-4 space-y-3">
              <div><p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Charges</p><Breakdown counts={revenue.chargesByStatus} empty="No charges posted yet." /></div>
              <div><p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Payments</p><Breakdown counts={revenue.paymentsByStatus} empty="No payments recorded yet." /></div>
            </div>
            {/* Stated plainly rather than left as a suspicious gap: there is no price in the database
                to compute subscription revenue from, and a made-up figure here would be worse than none. */}
            <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground">
              Crecy&apos;s own subscription revenue is not shown. No plan price is stored yet, so any MRR figure here would be invented.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b"><CardTitle>Plans and trials</CardTitle><CardDescription>Who is on what, and which trials need a decision.</CardDescription></CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Customers by status</p>
              <Breakdown counts={customers.byStatus} empty="No organizations yet." />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Plan mix</p>
              {plans.mix.length ? (
                <div className="flex flex-wrap gap-2">{plans.mix.map((row) => <Badge key={`${row.planCode}-${row.status}`} variant="neutral">{row.planCode} · {row.status.replace(/_/g, " ")} · {whole(row.count)}</Badge>)}</div>
              ) : <p className="text-sm text-muted-foreground">No subscriptions yet.</p>}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Trials ending within 14 days</p>
              {plans.trialsEndingSoon.length ? (
                <ul className="divide-y">
                  {plans.trialsEndingSoon.map((trial) => (
                    <li key={trial.organizationId} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={`/platform/${trial.organizationId}`} className="min-w-0 flex-1 font-medium hover:underline">{trial.displayName}</Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{daysUntil(trial.trialEndsAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No trial ends in the next two weeks.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div><CardTitle>Operations</CardTitle><CardDescription>What is broken before a customer tells you.</CardDescription></div>
            <Badge variant={needsAttention ? "warning" : "success"}>{needsAttention ? "Needs attention" : "Healthy"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Clock} label="Last rent run" value={operations.lastCompletedChargeRunAt ? "Completed" : "Never"} hint={when(operations.lastCompletedChargeRunAt)} />
          <Stat icon={CircleAlert} label="Mail not delivered" value={whole(unhealthyNotifications)} hint="failed or dead-lettered jobs" />
          <Stat icon={ShieldCheck} label="Quarantined files" value={whole(operations.documentsQuarantined)} hint={`${whole(operations.documentsRejected)} rejected by the scanner`} />
          <Stat icon={LifeBuoy} label="Open support sessions" value={whole(operations.openSupportSessions)} hint="active grants into customer data" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div><p className="font-semibold">Investigate a specific customer</p><p className="text-sm text-muted-foreground">Opens an audited, time-boxed, read-only session.</p></div>
          <Button asChild variant="secondary"><Link href="/platform/support">Support console<ArrowRight className="h-4 w-4" /></Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
