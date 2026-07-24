import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarClock,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Coins,
  Filter,
  Gauge,
  Settings2,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { parseDashboardFilters, type DashboardFilters } from "@/lib/dashboard-filters";
import { getDashboardState, type DashboardState } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const money = (amountMinor: number, currencyCode: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: currencyCode,
  maximumFractionDigits: 0,
}).format(amountMinor / 100);

const day = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${value}T12:00:00.000Z`));

const timestamp = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
}).format(new Date(value));

const label = (value: string) => value.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

function workspaceHref(path: string, filters: DashboardFilters) {
  const query = new URLSearchParams({ from: filters.fromDate, to: filters.toDate });
  if (filters.propertyId) query.set("propertyId", filters.propertyId);
  if (filters.accountingBookId) query.set("bookId", filters.accountingBookId);
  return `${path}?${query}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const parsed = parseDashboardFilters(await searchParams);
  const dashboard = await getDashboardState(parsed.filters);
  const filters = {
    ...parsed.filters,
    propertyId: dashboard.scope.propertyId ?? parsed.filters.propertyId,
    accountingBookId: dashboard.scope.accountingBookId ?? parsed.filters.accountingBookId,
  };
  const cutoff = dashboard.scope.cutoffAt ? timestamp(dashboard.scope.cutoffAt) : "Not connected";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Operator workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Command center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Decisions and exceptions across the properties and domains you are authorized to see.
          </p>
        </div>
        <div className="text-sm text-muted-foreground lg:text-right">
          <p>Operational cutoff: <span className="font-medium text-foreground">{cutoff}</span></p>
          <p className="mt-1">Payment period: {day(filters.fromDate)} – {day(filters.toDate)}</p>
        </div>
      </div>

      {dashboard.mode === "setup" ? (
        <Alert variant="warning">
          <Settings2 aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Connect Supabase to activate this workspace</AlertTitle>
          <AlertDescription>Add the project URL and publishable key, then apply the reviewed migrations.</AlertDescription>
        </Alert>
      ) : null}
      {dashboard.mode === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Command center unavailable</AlertTitle>
          <AlertDescription>Refresh and try again. Request {dashboard.requestId}.</AlertDescription>
        </Alert>
      ) : null}
      {parsed.invalid ? (
        <Alert variant="warning">
          <Filter aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Invalid filters were cleared</AlertTitle>
          <AlertDescription>The command center returned to the most recent 30-day period.</AlertDescription>
        </Alert>
      ) : null}

      <DashboardFilterForm dashboard={dashboard} filters={filters} />

      <section aria-label="Financial summary" className="grid gap-4 md:grid-cols-2">
        {dashboard.domains.finance ? dashboard.metrics.currency.map((metric) => (
          <Card key={metric.currencyCode}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">Rent collected</p>
                <Badge variant="info">{metric.currencyCode}</Badge>
              </div>
              <p className="mt-3 font-mono text-3xl font-semibold tracking-[-0.04em]">{money(metric.collectedMinor, metric.currencyCode)}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4 text-sm">
                <span className="text-muted-foreground">Overdue now</span>
                <span className="font-mono font-semibold">{money(metric.overdueMinor, metric.currencyCode)}</span>
              </div>
              <Button asChild variant="ghost" size="sm" className="mt-3 -ml-3">
                <Link href={workspaceHref("/app/money", filters)}>Open money workspace <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        )) : (
          <Card className="md:col-span-2">
            <CardContent className="flex items-start gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Coins className="h-5 w-5" /></span>
              <div><p className="font-semibold">Financial metrics are outside your role</p><p className="mt-1 text-sm text-muted-foreground">Rent and overdue totals appear only with finance access to the selected property scope.</p></div>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-label="Operational summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Gauge}
          label="Occupancy"
          value={dashboard.domains.portfolio && dashboard.metrics.totalUnits > 0
            ? `${Math.round((dashboard.metrics.occupiedUnits / dashboard.metrics.totalUnits) * 100)}%`
            : dashboard.domains.portfolio ? "—" : "Restricted"}
          detail={dashboard.domains.portfolio ? `${dashboard.metrics.occupiedUnits} of ${dashboard.metrics.totalUnits} rentable units occupied` : "Portfolio access required"}
          href={workspaceHref("/app/properties", filters)}
        />
        <MetricCard
          icon={Wrench}
          label="Open work orders"
          value={dashboard.domains.maintenance ? String(dashboard.metrics.openWorkOrders) : "Restricted"}
          detail="Excludes completed, closed, and canceled work"
          href={workspaceHref("/app/maintenance", filters)}
        />
        <MetricCard
          icon={CalendarClock}
          label="Leases expiring"
          value={dashboard.domains.portfolio ? String(dashboard.metrics.expiringLeases) : "Restricted"}
          detail="Active leases ending in the next 90 days"
          href={workspaceHref("/app/leases/record", filters)}
        />
        <MetricCard
          icon={ClipboardCheck}
          label="Owner approvals"
          value={dashboard.domains.owners ? String(dashboard.metrics.pendingOwnerApprovals) : "Restricted"}
          detail={`${dashboard.metrics.openReconciliationExceptions} open reconciliation exception${dashboard.metrics.openReconciliationExceptions === 1 ? "" : "s"}`}
          href={workspaceHref("/app/maintenance", filters)}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
        <AttentionQueue items={dashboard.attention} mode={dashboard.mode} />
        <ActivityFeed items={dashboard.activity} mode={dashboard.mode} />
      </div>

      <PropertyPerformance dashboard={dashboard} filters={filters} />
    </div>
  );
}

function DashboardFilterForm({ dashboard, filters }: { dashboard: DashboardState; filters: DashboardFilters }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><CardTitle>Scope and period</CardTitle></div>
        <CardDescription>{dashboard.scope.propertyCount} accessible propert{dashboard.scope.propertyCount === 1 ? "y" : "ies"} in the current result.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <form action="/app" method="get" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_.8fr_.8fr_auto] xl:items-end">
          <div className="space-y-2">
            <Label htmlFor="dashboard-property">Property</Label>
            <NativeSelect id="dashboard-property" name="propertyId" defaultValue={filters.propertyId ?? ""}>
              <option value="">All accessible properties</option>
              {dashboard.filters.properties.map((property) => <option key={property.propertyId} value={property.propertyId}>{property.name} · {property.currencyCode}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-book">Book / currency</Label>
            <NativeSelect id="dashboard-book" name="bookId" defaultValue={filters.accountingBookId ?? ""}>
              <option value="">All accessible books</option>
              {dashboard.filters.books.map((book) => <option key={book.accountingBookId} value={book.accountingBookId}>{book.name} · {book.currencyCode}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-from">From</Label>
            <Input id="dashboard-from" name="from" type="date" max={filters.toDate} defaultValue={filters.fromDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-to">To</Label>
            <Input id="dashboard-to" name="to" type="date" min={filters.fromDate} max={new Date().toISOString().slice(0, 10)} defaultValue={filters.toDate} />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Apply</Button>
            <Button asChild type="button" variant="outline"><Link href="/app">Reset</Link></Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon: Icon, label: metricLabel, value, detail, href }: {
  icon: typeof Gauge;
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{metricLabel}</p><Icon className="h-4 w-4 text-primary" /></div>
        <p className="mt-3 font-mono text-3xl font-semibold tracking-[-0.04em]">{value}</p>
        <p className="mt-2 min-h-8 text-xs leading-4 text-muted-foreground">{detail}</p>
        <Button asChild variant="ghost" size="sm" className="mt-2 -ml-3"><Link href={href}>View workspace <ArrowRight className="h-4 w-4" /></Link></Button>
      </CardContent>
    </Card>
  );
}

function AttentionQueue({ items, mode }: { items: DashboardState["attention"]; mode: DashboardState["mode"] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b">
        <div><CardTitle>Attention queue</CardTitle><CardDescription>Highest-impact unresolved work in your authorized scope.</CardDescription></div>
        <Badge variant={items.length ? "warning" : "success"}>{items.length} item{items.length === 1 ? "" : "s"}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {items.length ? <div className="divide-y">{items.map((item, index) => (
          <Link key={`${item.kind}:${item.propertyId}:${item.occurredAt}:${index}`} href={item.href} className="group flex items-start gap-4 px-5 py-5 transition-colors hover:bg-muted/40">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fffaeb] text-warning"><CircleAlert className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.title}</span><Badge variant="neutral">{label(item.kind)}</Badge></span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
              <span className="mt-2 block text-xs text-muted-foreground">{timestamp(item.occurredAt)}{item.amountMinor != null && item.currencyCode ? ` · ${money(item.amountMinor, item.currencyCode)}` : ""}</span>
            </span>
            <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}</div> : (
          <EmptyState
            icon={CircleCheckBig}
            title={mode === "ready" ? "Queue is clear" : "No live queue yet"}
            description={mode === "ready" ? "No overdue balances, open reconciliation exceptions, pending approvals, or draft work orders need attention." : "Operational items appear after the workspace is connected."}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ items, mode }: { items: DashboardState["activity"]; mode: DashboardState["mode"] }) {
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>Recent activity</CardTitle><CardDescription>Sanitized audit events, newest first.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {items.length ? <div className="divide-y">{items.map((item) => (
          <Link key={`${item.actionCode}:${item.resourceId}:${item.occurredAt}`} href={item.href} className="flex gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Activity className="h-3.5 w-3.5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label(item.actionCode)}</span><span className="mt-1 block text-xs text-muted-foreground">{item.propertyName} · {timestamp(item.occurredAt)}</span></span>
          </Link>
        ))}</div> : (
          <EmptyState icon={Activity} title={mode === "ready" ? "No recent activity" : "Activity is not connected"} description="Authorized property, finance, maintenance, and owner events will appear here." />
        )}
      </CardContent>
    </Card>
  );
}

function PropertyPerformance({ dashboard, filters }: { dashboard: DashboardState; filters: DashboardFilters }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b"><CardTitle>Property performance</CardTitle><CardDescription>Exact occupancy, overdue balance, and open-work totals. Restricted domain values remain hidden.</CardDescription></CardHeader>
      {dashboard.propertyPerformance.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-semibold">Property</th><th className="px-5 py-3 font-semibold">Occupancy</th><th className="px-5 py-3 font-semibold">Overdue</th><th className="px-5 py-3 font-semibold">Open work</th><th className="px-5 py-3"><span className="sr-only">Open</span></th></tr></thead>
              <tbody className="divide-y">{dashboard.propertyPerformance.map((property) => (
                <tr key={property.propertyId} className="hover:bg-muted/40">
                  <td className="px-5 py-4"><p className="font-semibold">{property.propertyName}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{property.currencyCode}</p></td>
                  <td className="px-5 py-4 font-mono">{property.totalUnits == null ? "Restricted" : `${property.occupiedUnits ?? 0} / ${property.totalUnits}`}</td>
                  <td className="px-5 py-4 font-mono">{property.overdueMinor == null ? "Restricted" : money(property.overdueMinor, property.currencyCode)}</td>
                  <td className="px-5 py-4 font-mono">{property.openWorkOrders == null ? "Restricted" : property.openWorkOrders}</td>
                  <td className="px-5 py-4 text-right"><Button asChild variant="ghost" size="icon"><Link href={`/app/properties/${property.propertyId}`} aria-label={`Open ${property.propertyName}`}><ArrowRight className="h-4 w-4" /></Link></Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">{dashboard.propertyPerformance.map((property) => (
            <Link key={property.propertyId} href={`/app/properties/${property.propertyId}`} className="flex items-start gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Building2 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{property.propertyName}</span><span className="mt-1 block text-sm text-muted-foreground">{property.totalUnits == null ? "Occupancy restricted" : `${property.occupiedUnits ?? 0} of ${property.totalUnits} occupied`} · {property.overdueMinor == null ? "Finance restricted" : `${money(property.overdueMinor, property.currencyCode)} overdue`}</span></span>
              <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}</div>
        </>
      ) : (
        <CardContent><EmptyState icon={Building2} title="No properties in this scope" description="Reset the filters or add a property to begin tracking portfolio performance." href={workspaceHref("/app/properties", filters)} /></CardContent>
      )}
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description, href }: { icon: typeof Activity; title: string; description: string; href?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {href ? <Button asChild variant="outline" size="sm" className="mt-5"><Link href={href}>Open properties</Link></Button> : null}
    </div>
  );
}
