import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Filter,
  Gauge,
  Settings2,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/crecy/empty-state";
import { MetricStrip, type MetricStripItem } from "@/components/crecy/metric-strip";
import { OperatorAttentionRail } from "@/components/crecy/operator-attention-rail";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { parseDashboardFilters, type DashboardFilters } from "@/lib/dashboard-filters";
import { getDashboardState, type DashboardState } from "@/lib/data/dashboard";
import { getActiveOrganizationId } from "@/lib/organization/context";

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

const titleCase = (value: string) => value
  .replaceAll(".", " ")
  .replaceAll("_", " ")
  .replace(/\b\w/g, (character) => character.toUpperCase());

function workspaceHref(path: string, filters: DashboardFilters) {
  const query = new URLSearchParams({ from: filters.fromDate, to: filters.toDate });
  if (filters.propertyId) query.set("propertyId", filters.propertyId);
  if (filters.accountingBookId) query.set("bookId", filters.accountingBookId);
  return `${path}?${query}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const parsed = parseDashboardFilters(await searchParams);
  const organizationId = await getActiveOrganizationId();
  const dashboard = await getDashboardState(organizationId, parsed.filters);
  const filters = {
    ...parsed.filters,
    propertyId: dashboard.scope.propertyId ?? parsed.filters.propertyId,
    accountingBookId: dashboard.scope.accountingBookId ?? parsed.filters.accountingBookId,
  };
  const cutoff = dashboard.scope.cutoffAt ? timestamp(dashboard.scope.cutoffAt) : "Not connected";
  const occupancy = dashboard.metrics.totalUnits > 0
    ? Math.round((dashboard.metrics.occupiedUnits / dashboard.metrics.totalUnits) * 100)
    : null;

  const metrics: MetricStripItem[] = [
    {
      label: "Occupancy",
      value: dashboard.domains.portfolio ? (occupancy == null ? "—" : `${occupancy}%`) : "Restricted",
      detail: dashboard.domains.portfolio
        ? `${dashboard.metrics.occupiedUnits} of ${dashboard.metrics.totalUnits} rentable units`
        : "Portfolio access required",
      href: workspaceHref("/app/properties", filters),
    },
    {
      label: "Open work orders",
      value: dashboard.domains.maintenance ? dashboard.metrics.openWorkOrders : "Restricted",
      detail: "Active work across the selected scope",
      href: workspaceHref("/app/maintenance", filters),
      emphasis: dashboard.metrics.openWorkOrders > 0 ? "warning" : "default",
    },
    {
      label: "Leases expiring",
      value: dashboard.domains.portfolio ? dashboard.metrics.expiringLeases : "Restricted",
      detail: "Active leases ending within 90 days",
      href: workspaceHref("/app/leases", filters),
    },
    {
      label: "Owner approvals",
      value: dashboard.domains.owners ? dashboard.metrics.pendingOwnerApprovals : "Restricted",
      detail: dashboard.domains.finance
        ? `${dashboard.metrics.openReconciliationExceptions} reconciliation exception${dashboard.metrics.openReconciliationExceptions === 1 ? "" : "s"}`
        : "Owner access required",
      href: workspaceHref("/app/maintenance", filters),
      emphasis: dashboard.metrics.pendingOwnerApprovals > 0 ? "brand" : "default",
    },
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-7">
      <PageHeader
        context={dashboard.organizationName}
        title="Command center"
        description="See what needs attention, what moved financially, and where the portfolio is drifting—without leaving the operating view."
        meta={
          <span>
            Operational cutoff <span className="font-medium text-foreground">{cutoff}</span>
            <span aria-hidden="true"> · </span>
            Payment period {day(filters.fromDate)} – {day(filters.toDate)}
          </span>
        }
      />

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

      <DashboardScopeBar dashboard={dashboard} filters={filters} />

      <MetricStrip items={metrics} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]">
        <FinancePulse dashboard={dashboard} filters={filters} />
        <WorkspacePanel
          title="Needs attention"
          description="Highest-impact unresolved work in your authorized scope."
          actions={
            <Badge variant={dashboard.attention.length ? "warning" : "success"}>
              {dashboard.attention.length} open
            </Badge>
          }
          bodyClassName="px-4 sm:px-5"
        >
          {dashboard.attention.length ? (
            <OperatorAttentionRail
              items={dashboard.attention.map((item) => ({
                title: item.title,
                meta: (
                  <>
                    {item.description}
                    <span aria-hidden="true"> · </span>
                    {timestamp(item.occurredAt)}
                    {item.amountMinor != null && item.currencyCode
                      ? <><span aria-hidden="true"> · </span>{money(item.amountMinor, item.currencyCode)}</>
                      : null}
                  </>
                ),
                href: item.href,
                status: <Badge variant="neutral">{titleCase(item.kind)}</Badge>,
              }))}
            />
          ) : (
            <EmptyState
              icon={CircleCheckBig}
              title={dashboard.mode === "ready" ? "Queue is clear" : "No live queue yet"}
              description={dashboard.mode === "ready"
                ? "No overdue balances, pending owner approvals, reconciliation exceptions, or draft work orders need attention."
                : "Operational items will appear here when the workspace is connected."}
              className="py-10"
            />
          )}
        </WorkspacePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <PropertyPerformance dashboard={dashboard} filters={filters} />
        <ActivityTimeline dashboard={dashboard} />
      </div>
    </div>
  );
}

function DashboardScopeBar({
  dashboard,
  filters,
}: {
  dashboard: DashboardState;
  filters: DashboardFilters;
}) {
  return (
    <section aria-label="Dashboard scope" className="border-y bg-card/45 py-3">
      <form action="/app" method="get" className="grid gap-3 px-1 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1.25fr)_minmax(190px,1.1fr)_150px_150px_auto_auto] xl:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-property" className="text-xs text-muted-foreground">Property</Label>
          <NativeSelect id="dashboard-property" name="propertyId" defaultValue={filters.propertyId ?? ""} className="h-9 bg-card">
            <option value="">All accessible properties</option>
            {dashboard.filters.properties.map((property) => (
              <option key={property.propertyId} value={property.propertyId}>
                {property.name} · {property.currencyCode}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dashboard-book" className="text-xs text-muted-foreground">Book / currency</Label>
          <NativeSelect id="dashboard-book" name="bookId" defaultValue={filters.accountingBookId ?? ""} className="h-9 bg-card">
            <option value="">All accessible books</option>
            {dashboard.filters.books.map((book) => (
              <option key={book.accountingBookId} value={book.accountingBookId}>
                {book.name} · {book.currencyCode}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dashboard-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="dashboard-from" name="from" type="date" max={filters.toDate} defaultValue={filters.fromDate} className="h-9 bg-card" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dashboard-to" className="text-xs text-muted-foreground">To</Label>
          <Input
            id="dashboard-to"
            name="to"
            type="date"
            min={filters.fromDate}
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={filters.toDate}
            className="h-9 bg-card"
          />
        </div>

        <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
          <Button type="submit" size="sm">Apply</Button>
          <Button asChild type="button" variant="ghost" size="sm"><Link href="/app">Reset</Link></Button>
        </div>

        <div className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-1 xl:text-right">
          {dashboard.scope.propertyCount} propert{dashboard.scope.propertyCount === 1 ? "y" : "ies"} in scope
        </div>
      </form>
    </section>
  );
}

function FinancePulse({
  dashboard,
  filters,
}: {
  dashboard: DashboardState;
  filters: DashboardFilters;
}) {
  return (
    <WorkspacePanel
      title="Payments & reconciliation"
      description="Collection and overdue exposure stay separated by accounting-book currency."
      actions={
        <div className="flex items-center gap-2">
          {dashboard.domains.finance ? (
            <Badge variant={dashboard.metrics.openReconciliationExceptions ? "warning" : "success"}>
              {dashboard.metrics.openReconciliationExceptions} exception{dashboard.metrics.openReconciliationExceptions === 1 ? "" : "s"}
            </Badge>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link href={workspaceHref("/app/payments", filters)}>
              Open payments <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      }
      bodyClassName="p-0"
    >
      {dashboard.domains.finance ? (
        dashboard.metrics.currency.length ? (
          <div className="divide-y">
            {dashboard.metrics.currency.map((metric, index) => (
              <div
                key={metric.currencyCode}
                className="grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1.25fr)_minmax(160px,.75fr)_auto] sm:items-end sm:px-6"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{metric.currencyCode}</span>
                    {index === 0 ? <span className="text-xs text-muted-foreground">Selected period</span> : null}
                  </div>
                  <p data-financial-value className="mt-2 text-[2.2rem] font-semibold leading-none tracking-[-0.045em] text-foreground">
                    {money(metric.collectedMinor, metric.currencyCode)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">Rent collected</p>
                </div>

                <div className="sm:border-l sm:pl-5">
                  <p data-financial-value className={`text-xl font-semibold tracking-[-0.025em] ${metric.overdueMinor > 0 ? "text-warning" : "text-foreground"}`}>
                    {money(metric.overdueMinor, metric.currencyCode)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Overdue now</p>
                </div>

                <Link
                  href={workspaceHref("/app/payments", filters)}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  Review ledger
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No finance books in this scope"
            description="Choose another property or accounting book to see collection and overdue exposure."
            action={<Button asChild variant="outline" size="sm"><Link href="/app">Reset scope</Link></Button>}
          />
        )
      ) : (
        <EmptyState
          title="Financial metrics are outside your role"
          description="Collection and overdue totals appear only when your role includes finance access to the selected property scope."
        />
      )}
    </WorkspacePanel>
  );
}

function PropertyPerformance({
  dashboard,
  filters,
}: {
  dashboard: DashboardState;
  filters: DashboardFilters;
}) {
  return (
    <WorkspacePanel
      title="Portfolio performance"
      description="Property health in the selected scope, using only domains your role can read."
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href={workspaceHref("/app/properties", filters)}>
            All properties <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      }
      bodyClassName="p-0"
    >
      {dashboard.propertyPerformance.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="border-b bg-[var(--surface-subtle)]/70 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-5 py-3 sm:px-6">Property</th>
                <th className="px-4 py-3">Occupancy</th>
                <th className="px-4 py-3">Overdue</th>
                <th className="px-4 py-3">Open work</th>
                <th className="w-12 px-4 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard.propertyPerformance.map((property) => {
                const propertyRestricted = property.totalUnits == null || property.occupiedUnits == null;
                const propertyOccupancy = propertyRestricted
                  ? null
                  : property.totalUnits > 0
                    ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
                    : null;

                return (
                  <tr key={property.propertyId} className="group transition-colors hover:bg-[var(--brand-subtle)]">
                    <td className="px-5 py-4 sm:px-6">
                      <Link href={`/app/properties/${property.propertyId}`} className="font-semibold tracking-[-0.01em] group-hover:text-primary">
                        {property.propertyName}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">{property.currencyCode}</div>
                    </td>
                    <td className="px-4 py-4">
                      {propertyRestricted ? (
                        <span className="text-muted-foreground">Restricted</span>
                      ) : property.totalUnits === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span>
                          <span className="font-semibold">{propertyOccupancy}%</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {property.occupiedUnits}/{property.totalUnits}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {property.overdueMinor == null ? (
                        <span className="text-muted-foreground">Restricted</span>
                      ) : (
                        <span data-financial-value className={property.overdueMinor > 0 ? "font-semibold text-warning" : "font-medium"}>
                          {money(property.overdueMinor, property.currencyCode)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {property.openWorkOrders == null
                        ? <span className="text-muted-foreground">Restricted</span>
                        : <span className="font-medium">{property.openWorkOrders}</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link href={`/app/properties/${property.propertyId}`} aria-label={`Open ${property.propertyName}`} className="inline-flex text-muted-foreground transition-colors hover:text-primary">
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Building2}
          title="No properties in this scope"
          description="Reset the filters or add a property to begin tracking portfolio performance."
          action={<Button asChild variant="outline" size="sm"><Link href="/app/properties">Open properties</Link></Button>}
        />
      )}
    </WorkspacePanel>
  );
}

function ActivityTimeline({ dashboard }: { dashboard: DashboardState }) {
  return (
    <WorkspacePanel
      title="Recent activity"
      description="Latest auditable changes across the properties you can see."
      bodyClassName="px-5 py-1 sm:px-6"
    >
      {dashboard.activity.length ? (
        <ol className="relative">
          {dashboard.activity.slice(0, 10).map((item, index) => (
            <li key={`${item.resourceType}:${item.resourceId}:${item.occurredAt}:${index}`} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-3 py-4">
              {index < Math.min(dashboard.activity.length, 10) - 1 ? (
                <span aria-hidden="true" className="absolute top-7 bottom-[-1rem] left-[5px] w-px bg-border" />
              ) : null}
              <span aria-hidden="true" className="mt-1.5 h-[11px] w-[11px] rounded-full border-2 border-card bg-primary ring-1 ring-primary/25" />
              <Link href={item.href} className="group min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-[-0.01em] group-hover:text-primary">
                      {titleCase(item.actionCode)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.propertyName} · {titleCase(item.resourceType)} · {titleCase(item.actorType)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timestamp(item.occurredAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={CircleCheckBig}
          title={dashboard.mode === "ready" ? "No recent activity" : "Activity will appear here"}
          description={dashboard.mode === "ready"
            ? "Auditable property, payment, tenancy, maintenance, and approval changes will appear as they occur."
            : "Connect the workspace to populate the audit timeline."}
          className="py-10"
        />
      )}
    </WorkspacePanel>
  );
}
