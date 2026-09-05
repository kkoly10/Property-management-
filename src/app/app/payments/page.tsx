import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  Plus,
  WalletCards,
} from "lucide-react";
import { EmptyState } from "@/components/crecy/empty-state";
import { MetricStrip, type MetricStripItem } from "@/components/crecy/metric-strip";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOperatorPaymentWorkspace, type ReceivableSummaryItem } from "@/lib/data/finance";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { ResolveExceptionControl } from "./resolve-exception-control";
import { WriteOffChargesForm } from "./write-off-charges-form";

export const dynamic = "force-dynamic";

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency,
}).format(amount / 100);

const sourceLabel = (source: string) => ({
  cash: "Cash",
  check: "Check",
  external_bank_transfer: "Bank transfer",
  other_manual: "Other",
}[source] ?? source);

const label = (value: string) => value.replaceAll("_", " ");
const reconciliationBadge = (status: string) => status === "reconciled"
  ? "success" as const
  : status === "exception"
    ? "warning" as const
    : "neutral" as const;

function totals(items: ReceivableSummaryItem[]) {
  return items.reduce<Record<string, number>>(
    (result, item) => ({ ...result, [item.currencyCode]: (result[item.currencyCode] ?? 0) + item.balanceMinor }),
    {},
  );
}

export default async function PaymentsPage() {
  const organizationId = await getActiveOrganizationId();
  const workspace = await getOperatorPaymentWorkspace(organizationId);
  const outstanding = totals(workspace.items);
  const outstandingEntries = Object.entries(outstanding);
  const collected = workspace.payments.filter((payment) => ["succeeded", "partially_refunded", "refunded"].includes(payment.status)).length;
  const reviewPaymentIds = new Set(
    workspace.payments
      .filter((payment) => {
        const statusReview = ["pending", "created", "failed", "returned"].includes(payment.status);
        const unapplied = ["succeeded", "partially_refunded"].includes(payment.status)
          && payment.amountMinor > (payment.allocatedMinor ?? 0);
        return statusReview || unapplied;
      })
      .map((payment) => payment.paymentId),
  );

  const outstandingValue = outstandingEntries.length === 0
    ? "—"
    : outstandingEntries.length === 1
      ? money(outstandingEntries[0][1], outstandingEntries[0][0])
      : `${outstandingEntries.length} currencies`;

  const outstandingDetail = outstandingEntries.length
    ? outstandingEntries.map(([currency, amount]) => `${currency} ${money(amount, currency)}`).join(" · ")
    : "No open receivable balance";

  const metrics: MetricStripItem[] = [
    {
      label: "Outstanding",
      value: outstandingValue,
      detail: outstandingDetail,
      emphasis: outstandingEntries.some(([, amount]) => amount > 0) ? "finance" : "default",
    },
    {
      label: "Collected payments",
      value: collected,
      detail: "Succeeded or subsequently refunded receipts",
    },
    {
      label: "Payments to review",
      value: reviewPaymentIds.size,
      detail: "Pending, failed, returned, or unapplied",
      emphasis: reviewPaymentIds.size ? "warning" : "default",
    },
    {
      label: "Reconciliation exceptions",
      value: workspace.exceptions.length,
      detail: "Provider-settlement mismatches still open",
      emphasis: workspace.exceptions.length ? "danger" : "default",
    },
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-7">
      <PageHeader
        context="Money"
        title="Payments"
        description="Journal-derived balances, controlled receipts, provider settlement reconciliation, and exception handling in one financial workspace."
        actions={
          <Button asChild>
            <Link href="/app/payments/record">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Record payment
            </Link>
          </Button>
        }
      />

      {workspace.mode === "setup" ? (
        <Alert variant="info">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Finance preview</AlertTitle>
          <AlertDescription>Sample data demonstrates the complete payment workflow until Supabase is connected.</AlertDescription>
        </Alert>
      ) : null}

      {workspace.mode === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Payments unavailable</AlertTitle>
          <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
        </Alert>
      ) : null}

      <MetricStrip items={metrics} />

      <WorkspacePanel
        title="Recent payments"
        description="Successful receipts are immutable; reconciliation remains a separate control."
        bodyClassName="p-0"
      >
        {workspace.payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="border-b bg-[var(--surface-subtle)]/70 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 sm:px-6">Resident</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Reconciliation</th>
                  <th className="w-12 px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workspace.payments.map((payment) => (
                  <tr key={payment.paymentId} className="group transition-colors hover:bg-[var(--brand-subtle)]">
                    <td className="px-5 py-4 sm:px-6">
                      <Link href={`/app/payments/${payment.paymentId}`} className="font-semibold tracking-[-0.01em] group-hover:text-primary">
                        {payment.householdName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{payment.propertyName} · Unit {payment.unitCode} · {payment.publicReference}</p>
                    </td>
                    <td data-financial-value className="px-4 py-4 font-semibold">{money(payment.amountMinor, payment.currencyCode)}</td>
                    <td className="px-4 py-4">
                      <p>{sourceLabel(payment.source)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{payment.receivedAt ? new Date(payment.receivedAt).toLocaleDateString() : "Awaiting provider"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={payment.status === "succeeded" ? "success" : ["failed", "returned"].includes(payment.status) ? "warning" : "neutral"}>
                        {label(payment.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      {payment.reconciliationStatus
                        ? <Badge variant={reconciliationBadge(payment.reconciliationStatus)}>{label(payment.reconciliationStatus)}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/app/payments/${payment.paymentId}`}
                        aria-label={`Open payment ${payment.publicReference}`}
                        className="inline-flex text-muted-foreground transition-colors hover:text-primary"
                      >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={WalletCards}
            title="No payments recorded"
            description="Record an externally received payment against an open charge."
            action={<Button asChild variant="outline" size="sm"><Link href="/app/payments/record">Record payment</Link></Button>}
          />
        )}
      </WorkspacePanel>

      <section aria-label="Settlement reconciliation" className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)]">
        <WorkspacePanel
          title="Provider settlements"
          description="Paid provider batches post only when imported items and gross, fee, and net totals reconcile."
          bodyClassName="p-0"
        >
          {workspace.settlements.length ? (
            <div className="divide-y">
              {workspace.settlements.map((settlement) => (
                <div key={settlement.settlementId} className="px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold">{settlement.publicReference}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {settlement.receivedAt
                          ? `Received ${new Date(settlement.receivedAt).toLocaleDateString()}`
                          : settlement.expectedArrivalDate
                            ? `Expected ${settlement.expectedArrivalDate}`
                            : "Arrival pending"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={settlement.providerStatus === "paid" ? "success" : "neutral"}>{label(settlement.providerStatus)}</Badge>
                      <Badge variant={reconciliationBadge(settlement.reconciliationStatus)}>{label(settlement.reconciliationStatus)}</Badge>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 border-y text-sm">
                    {[
                      ["Gross", settlement.grossMinor],
                      ["Fees", settlement.feeMinor],
                      ["Net", settlement.netMinor],
                    ].map(([term, amount], index) => (
                      <div key={String(term)} className={`py-3 ${index > 0 ? "border-l pl-4" : ""}`}>
                        <dt className="text-xs text-muted-foreground">{String(term)}</dt>
                        <dd data-financial-value className="mt-1 font-semibold">{money(Number(amount), settlement.currencyCode)}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="mt-3 text-xs text-muted-foreground">{settlement.matchedCount} of {settlement.itemCount} items matched</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CircleCheckBig}
              title="No settlements imported"
              description="Signed provider payout events will appear here."
              className="py-10"
            />
          )}
        </WorkspacePanel>

        <WorkspacePanel
          title="Exception queue"
          description="Mismatches remain open until an operator records an explicit resolution."
          actions={<Badge variant={workspace.exceptions.length ? "warning" : "success"}>{workspace.exceptions.length} open</Badge>}
          bodyClassName="p-0"
        >
          {workspace.exceptions.length ? (
            <div className="divide-y">
              {workspace.exceptions.map((exception) => (
                <div key={exception.exceptionId} className="px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm font-semibold">{exception.settlementReference}</p>
                    <Badge variant="warning">{label(exception.exceptionType)}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6">{exception.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {exception.expectedMinor != null ? <span>Expected {money(exception.expectedMinor, exception.currencyCode)}</span> : null}
                    {exception.actualMinor != null ? <span>Actual {money(exception.actualMinor, exception.currencyCode)}</span> : null}
                    {exception.paymentReference ? <span>{exception.paymentReference}</span> : null}
                  </div>
                  <ResolveExceptionControl
                    exceptionId={exception.exceptionId}
                    organizationId={exception.organizationId}
                    status={exception.status}
                    disabled={workspace.mode !== "ready"}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CircleCheckBig}
              title="No open exceptions"
              description="Imported settlement totals and references are aligned."
              className="py-10"
            />
          )}
        </WorkspacePanel>
      </section>

      <WorkspacePanel
        title="Resident balances"
        description="Remaining amounts reflect allocations posted to accounts receivable."
        bodyClassName="p-0"
      >
        {workspace.items.length ? (
          <div className="divide-y">
            {workspace.items.map((item) => (
              <div key={item.tenancyId} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(150px,.7fr)_minmax(180px,.8fr)] sm:items-center sm:px-6">
                <div>
                  <p className="font-semibold tracking-[-0.01em]">{item.propertyName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Unit {item.unitCode}</p>
                </div>
                <p data-financial-value className="font-semibold">{money(item.balanceMinor, item.currencyCode)}</p>
                <div className="sm:text-right">
                  <p className="text-sm">{item.nextDueDate ?? "No upcoming charge"}</p>
                  {item.nextDueAmountMinor != null ? (
                    <p data-financial-value className="mt-1 text-xs text-muted-foreground">{money(item.nextDueAmountMinor, item.currencyCode)} remaining</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No resident balances" description="Open receivables will appear here when charges are posted." className="py-10" />
        )}
      </WorkspacePanel>

      {workspace.options.some((option) => option.charges.length) ? (
        <WorkspacePanel
          title="Uncollectible receivables"
          description="Write-offs post bad-debt expense against accounts receivable and can only be corrected by reversal."
          bodyClassName="p-0"
        >
          <div className="divide-y">
            {workspace.options.filter((option) => option.charges.length).map((option) => (
              <div key={option.tenancyId} className="space-y-3 px-5 py-5 sm:px-6">
                <div>
                  <p className="font-semibold">{option.householdName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{option.propertyName} · Unit {option.unitCode}</p>
                </div>
                <WriteOffChargesForm option={option} disabled={workspace.mode !== "ready"} />
              </div>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}
    </div>
  );
}
