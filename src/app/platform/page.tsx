import Link from "next/link";
import { ArrowRight, CircleAlert, KeyRound, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricStrip, type MetricStripItem } from "@/components/crecy/metric-strip";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { getBusinessOverview } from "@/lib/data/platform-business";

export const dynamic = "force-dynamic";

const money = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);

const whole = (value: number) => new Intl.NumberFormat("en-US").format(value);

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "never";
}

function daysUntil(value: string | null): string {
  if (!value) return "no end date";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "already lapsed";
  if (days === 0) return "ends today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/** Money is reported per currency because the books never mix them. */
function Amounts({ byCurrency }: { byCurrency: Record<string, number> }) {
  const entries = Object.entries(byCurrency);
  if (!entries.length) return <span className="text-muted-foreground">—</span>;
  return <>{entries.map(([currency, total]) => <span key={currency} className="ml-3">{money(total, currency)}</span>)}</>;
}

function MoneyRow({ label, byCurrency }: { label: string; byCurrency: Record<string, number> }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span data-financial-value className="text-right text-sm font-semibold tabular-nums"><Amounts byCurrency={byCurrency} /></span>
    </div>
  );
}

function Breakdown({ counts, empty }: { counts: Record<string, number>; empty: string }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, count]) => <Badge key={key} variant="neutral">{key.replace(/_/g, " ")} · {whole(count)}</Badge>)}
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
  const { customers, plans, portfolio, money: ledger, operations } = overview;
  const undelivered = (operations.notificationJobsByStatus.dead_letter ?? 0) + (operations.notificationJobsByStatus.failed ?? 0);
  const needsAttention = undelivered > 0 || operations.documentsQuarantined > 0;

  const headline: MetricStripItem[] = [
    { label: "Customers", value: whole(customers.total), detail: `${whole(customers.newLast30Days)} joined in the last 30 days`, emphasis: "brand" },
    { label: "Units managed", value: whole(portfolio.units), detail: `across ${whole(portfolio.properties)} propert${portfolio.properties === 1 ? "y" : "ies"}` },
    { label: "Active tenancies", value: whole(portfolio.activeTenancies), detail: `${whole(portfolio.activeStaff)} staff seats in use` },
    { label: "New this week", value: whole(customers.newLast7Days), detail: "organizations created" },
  ];

  const health: MetricStripItem[] = [
    { label: "Last rent run", value: operations.lastCompletedChargeRunAt ? "Completed" : "Never", detail: when(operations.lastCompletedChargeRunAt), emphasis: operations.lastCompletedChargeRunAt ? "default" : "danger" },
    { label: "Mail not delivered", value: whole(undelivered), detail: "failed or dead-lettered jobs", emphasis: undelivered > 0 ? "danger" : "default" },
    { label: "Quarantined files", value: whole(operations.documentsQuarantined), detail: `${whole(operations.documentsRejected)} rejected by the scanner`, emphasis: operations.documentsQuarantined > 0 ? "warning" : "default" },
    { label: "Open support sessions", value: whole(operations.openSupportSessions), detail: "active grants into customer data" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        context="Platform"
        title="How Crecy is doing"
        description={<>Every customer at once. To look inside one of them, open an audited support session from the <Link href="/platform/support" className="font-semibold text-primary hover:underline">support console</Link>.</>}
        meta={overview.generatedAt ? `Figures as of ${when(overview.generatedAt)}` : undefined}
        actions={<Badge variant={needsAttention ? "warning" : "success"}>{needsAttention ? "Needs attention" : "All healthy"}</Badge>}
      />

      {state.mode === "setup" ? (
        <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Sample data</AlertTitle><AlertDescription>This preview renders until Supabase is connected and your account is provisioned as a platform administrator.</AlertDescription></Alert>
      ) : null}

      <MetricStrip items={headline} />

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkspacePanel title="Money through the ledger" description="What customers have billed and collected — not Crecy's own revenue." bodyClassName="px-5 py-4 sm:px-6">
          <MoneyRow label="Billed" byCurrency={ledger.billedMinorByCurrency} />
          <MoneyRow label="Collected" byCurrency={ledger.collectedMinorByCurrency} />
          <MoneyRow label="Outstanding" byCurrency={ledger.outstandingMinorByCurrency} />
          <div className="mt-4 space-y-3">
            <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Charges</p><Breakdown counts={ledger.chargesByStatus} empty="No charges posted yet." /></div>
            <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Payments</p><Breakdown counts={ledger.paymentsByStatus} empty="No payments recorded yet." /></div>
          </div>
          {/* Stated plainly rather than left as a suspicious gap: no plan price is stored anywhere, so
              a subscription-revenue figure here would be invented. */}
          <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground">
            Crecy&apos;s own subscription revenue is not shown. No plan price is stored yet, so any MRR figure here would be invented.
          </p>
        </WorkspacePanel>

        <WorkspacePanel title="Plans and trials" description="Who is on what, and which trials need a decision." bodyClassName="space-y-4 px-5 py-4 sm:px-6">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Customers by status</p>
            <Breakdown counts={customers.byStatus} empty="No organizations yet." />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan mix</p>
            {plans.mix.length ? (
              <div className="flex flex-wrap gap-2">{plans.mix.map((row) => <Badge key={`${row.planCode}-${row.status}`} variant="neutral">{row.planCode} · {row.status.replace(/_/g, " ")} · {whole(row.count)}</Badge>)}</div>
            ) : <p className="text-sm text-muted-foreground">No subscriptions yet.</p>}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Trials ending within 14 days</p>
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
        </WorkspacePanel>
      </div>

      <div className="space-y-3">
        <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Operations</h2>
        <MetricStrip items={health} />
      </div>

      <WorkspacePanel bodyClassName="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div><p className="font-semibold">Investigate a specific customer</p><p className="text-sm text-muted-foreground">Opens an audited, time-boxed, read-only session.</p></div>
        <Button asChild variant="secondary"><Link href="/platform/support">Support console<ArrowRight className="h-4 w-4" /></Link></Button>
      </WorkspacePanel>
    </div>
  );
}
