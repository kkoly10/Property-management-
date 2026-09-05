import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  FileCheck2,
  ReceiptText,
} from "lucide-react";
import { EmptyState } from "@/components/crecy/empty-state";
import { OwnerFinancialBand } from "@/components/crecy/owner-financial-band";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRecipientAnnouncementWorkspace } from "@/lib/data/announcements";
import { getOwnerApprovalWorkspace } from "@/lib/data/owner-approvals";
import { getOwnerStatementWorkspace, type OwnerStatementSummary } from "@/lib/data/owner-statements";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency,
}).format(amountMinor / 100);

const period = (item: OwnerStatementSummary) => {
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(`${item.periodStart}T12:00:00.000Z`))} – ${format.format(new Date(`${item.periodEnd}T12:00:00.000Z`))}`;
};

export default async function OwnerHomePage() {
  const [approvals, statements, announcements] = await Promise.all([
    getOwnerApprovalWorkspace(),
    getOwnerStatementWorkspace(),
    getRecipientAnnouncementWorkspace(),
  ]);

  const latestStatement = [...statements.items].sort(
    (a, b) => new Date(b.finalizedAt).getTime() - new Date(a.finalizedAt).getTime(),
  )[0];

  const pendingApprovals = approvals.items.filter((item) => item.status === "pending");
  const ownerName = latestStatement?.ownerName ?? approvals.items[0]?.ownerName ?? "Owner portal";
  const recentStatements = [...statements.items]
    .sort((a, b) => new Date(b.finalizedAt).getTime() - new Date(a.finalizedAt).getTime())
    .slice(0, 6);
  const recentRemittances = [...statements.remittances]
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
    .slice(0, 6);

  return (
    <OwnerShell>
      <div className="space-y-7">
        <PageHeader
          context={ownerName}
          title="Owner overview"
          description="Finalized financial records, recorded distributions, and decisions that need your approval—without exposing resident-level accounting detail."
          meta={latestStatement ? `Latest finalized statement · ${latestStatement.propertyName} · ${period(latestStatement)}` : undefined}
        />

        {approvals.mode === "setup" || statements.mode === "setup" ? (
          <Alert variant="info">
            <FileCheck2 aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Owner portal preview</AlertTitle>
            <AlertDescription>This sample is read-only until Supabase and an owner relationship are connected.</AlertDescription>
          </Alert>
        ) : null}

        {approvals.mode === "error" || statements.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Owner overview unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {approvals.requestId ?? statements.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        {latestStatement ? (
          <OwnerFinancialBand
            period={
              <span>
                Latest finalized statement
                <span aria-hidden="true"> · </span>
                {latestStatement.propertyName}
                <span aria-hidden="true"> · </span>
                {period(latestStatement)}
                <span aria-hidden="true"> · </span>
                {latestStatement.currencyCode}
              </span>
            }
            metrics={[
              {
                label: "Net owner position",
                value: money(latestStatement.netOwnerPositionMinor, latestStatement.currencyCode),
                detail: `Finalized v${latestStatement.versionNumber}`,
                tone: "finance",
              },
              {
                label: "Period income",
                value: money(latestStatement.incomeMinor, latestStatement.currencyCode),
                detail: "Owner-allocated posted income",
              },
              {
                label: "Operating expenses",
                value: money(latestStatement.expenseMinor, latestStatement.currencyCode),
                detail: `Management fees shown separately: ${money(latestStatement.managementFeeMinor, latestStatement.currencyCode)}`,
              },
              {
                label: "Current owner payable",
                value: money(latestStatement.ownerPayableMinor, latestStatement.currencyCode),
                detail: `Recorded remittances: ${money(latestStatement.remittedMinor, latestStatement.currencyCode)}`,
                tone: "finance",
              },
            ]}
          />
        ) : (
          <section className="border-y bg-card/55 px-5 py-7 sm:px-6">
            <p className="text-sm font-semibold">No finalized financial statement yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Your operator’s immutable statement snapshots will appear here after finalization.</p>
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
          <WorkspacePanel
            title="Finalized statements"
            description="Immutable owner allocations. Each currency and property remains separate."
            bodyClassName="p-0"
            className="scroll-mt-28"
          >
            <div id="statements" className="scroll-mt-28">
              {recentStatements.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                    <thead className="border-b bg-[var(--surface-subtle)]/70 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 sm:px-6">Property / period</th>
                        <th className="px-4 py-3">Income</th>
                        <th className="px-4 py-3">Net position</th>
                        <th className="px-4 py-3">Owner payable</th>
                        <th className="w-12 px-4 py-3"><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {recentStatements.map((item) => (
                        <tr key={item.statementSnapshotId} className="group transition-colors hover:bg-[var(--brand-subtle)]">
                          <td className="px-5 py-4 sm:px-6">
                            <Link href={`/owner/statements/${item.statementSnapshotId}`} className="font-semibold tracking-[-0.01em] group-hover:text-primary">
                              {item.propertyName}
                            </Link>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {period(item)} · {item.currencyCode} · v{item.versionNumber}
                            </div>
                          </td>
                          <td data-financial-value className="px-4 py-4 font-medium">{money(item.incomeMinor, item.currencyCode)}</td>
                          <td data-financial-value className="px-4 py-4 font-semibold text-[var(--finance-accent)]">{money(item.netOwnerPositionMinor, item.currencyCode)}</td>
                          <td data-financial-value className="px-4 py-4 font-medium">{money(item.ownerPayableMinor, item.currencyCode)}</td>
                          <td className="px-4 py-4 text-right">
                            <Link href={`/owner/statements/${item.statementSnapshotId}`} aria-label={`Open statement for ${item.propertyName}`} className="inline-flex text-muted-foreground transition-colors hover:text-primary">
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
                  icon={FileCheck2}
                  title="No finalized statements"
                  description="Finalized statement snapshots assigned to your exact owner entity will appear here."
                  className="py-12"
                />
              )}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Needs your decision"
            description={pendingApprovals.length
              ? `${pendingApprovals.length} pending approval${pendingApprovals.length === 1 ? "" : "s"}`
              : "No pending owner decisions"}
            bodyClassName="p-0"
            className="scroll-mt-28"
          >
            <div id="approvals" className="scroll-mt-28">
              {pendingApprovals.length ? (
                <div className="divide-y">
                  {pendingApprovals.slice(0, 5).map((item) => (
                    <Link
                      key={item.approvalRequestId}
                      href={`/owner/approvals/${item.approvalRequestId}`}
                      className="group block px-5 py-4 transition-colors hover:bg-[var(--brand-subtle)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold tracking-[-0.01em]">{item.scope}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {item.propertyName}{item.unitCode ? ` · Unit ${item.unitCode}` : ""}
                            <span aria-hidden="true"> · </span>
                            {item.workOrderReference}
                          </p>
                          {item.amountMinor !== null && item.currencyCode ? (
                            <p data-financial-value className="mt-2 text-sm font-semibold text-[var(--finance-accent)]">
                              {money(item.amountMinor, item.currencyCode)}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant="warning">Pending</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(item.requestedAt).toLocaleDateString()}</span>
                        <span className="font-semibold text-primary group-hover:underline">Review</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CircleCheckBig}
                  title="Nothing needs approval"
                  description="New work-order approval requests assigned to your owner entity will appear here."
                  className="py-10"
                />
              )}
            </div>
          </WorkspacePanel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
          <WorkspacePanel
            title="Recorded distributions"
            description="Evidence-backed remittances your operator recorded as paid outside Crecy."
            bodyClassName="p-0"
            className="scroll-mt-28"
          >
            <div id="remittances" className="scroll-mt-28">
              {recentRemittances.length ? (
                <div className="divide-y">
                  {recentRemittances.map((item) => (
                    <div key={item.remittanceId} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ReceiptText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                          <p className="truncate text-sm font-semibold">{item.propertyName ?? item.publicReference}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Paid {new Date(`${item.paidOn}T12:00:00.000Z`).toLocaleDateString()}
                          {item.externalReference ? <><span aria-hidden="true"> · </span>{item.externalReference}</> : null}
                          <span aria-hidden="true"> · </span>{item.publicReference}
                        </p>
                      </div>
                      <p data-financial-value className="text-lg font-semibold tracking-[-0.02em] text-[var(--finance-accent)]">
                        {money(item.amountMinor, item.currencyCode)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ReceiptText}
                  title="No recorded distributions"
                  description="External remittances will appear after your operator records evidence and reconciles owner payable."
                  className="py-10"
                />
              )}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="From your property team"
            description="Recent notices sent to your owner relationship."
            bodyClassName="p-0"
          >
            {announcements.mode === "error" ? (
              <div className="px-5 py-6">
                <p className="text-sm font-medium text-destructive">Notices are temporarily unavailable.</p>
                <p className="mt-1 text-xs text-muted-foreground">Request {announcements.requestId}.</p>
              </div>
            ) : announcements.items.length ? (
              <div className="divide-y">
                {announcements.items.slice(0, 4).map((item) => (
                  <article key={item.deliveryId} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-primary">{item.propertyName ?? "Management"}</p>
                      <time className="text-[11px] text-muted-foreground">{new Date(item.publishedAt).toLocaleDateString()}</time>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.bodyText}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8">
                <p className="text-sm font-medium">No new notices.</p>
                <p className="mt-1 text-sm text-muted-foreground">Owner announcements from your property team will appear here.</p>
              </div>
            )}
          </WorkspacePanel>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-5">
          <Button asChild variant="outline" size="sm"><Link href="/owner/documents">Documents</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/owner/messages">Messages</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link href="/owner/preferences">Notification preferences</Link></Button>
        </div>
      </div>
    </OwnerShell>
  );
}
