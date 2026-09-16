import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Download, FileLock2, ReceiptText, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { PageHeader } from "@/components/crecy/page-header";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOwnerStatementDetail } from "@/lib/data/owner-statements";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency,
}).format(amountMinor / 100);

const date = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${value}T12:00:00.000Z`));

const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value));

const category = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export default async function OwnerStatementDetailPage({ params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const detail = await getOwnerStatementDetail(statementId);
  if (detail.mode === "ready" && !detail.item) notFound();
  const item = detail.item;

  return (
    <OwnerShell
      chromeTitle="Financial records"
      chromeDescription="Finalized statements and recorded distributions"
      mainClassName="print:w-full"
    >
      <article className="space-y-7 print:space-y-5">
        <div className="hidden items-center justify-between border-b-2 pb-4 print:flex">
          <Wordmark product="Owner" className="max-w-[9rem]" />
          <p className="text-xs text-muted-foreground">Finalized owner statement</p>
        </div>

        <Button asChild variant="ghost" size="sm" className="-ml-2 print:hidden">
          <Link href="/owner#statements"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Statements</Link>
        </Button>

        {detail.mode === "setup" ? (
          <Alert variant="info" className="print:hidden">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Statement preview</AlertTitle>
            <AlertDescription>This sample is read-only until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}

        {detail.mode === "error" || !item ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Statement unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription>
          </Alert>
        ) : (
          <>
            <PageHeader
              context={`${item.snapshot.ownerName} · ${item.snapshot.currencyCode}`}
              title={`${item.snapshot.propertyName} owner statement`}
              description={`${date(item.snapshot.periodStart)} – ${date(item.snapshot.periodEnd)}. This finalized record contains owner-level allocations only; resident and payment details are excluded.`}
              meta={`Statement series ${item.statementSeriesId.slice(0, 8)} · Version ${item.versionNumber}`}
              actions={detail.mode === "ready" ? (
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/v1/owner-statements/${statementId}/export`}><Download aria-hidden="true" className="h-4 w-4" />Download CSV</a>
                  </Button>
                  <PrintButton />
                </div>
              ) : undefined}
            />

            {item.correctionReason ? (
              <Alert variant="warning">
                <AlertTitle>Corrected statement</AlertTitle>
                <AlertDescription>{item.correctionReason}</AlertDescription>
              </Alert>
            ) : null}

            <section aria-label="Statement financial summary" className="overflow-hidden border-y bg-card sm:rounded-[1rem] sm:border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-xs text-muted-foreground sm:px-6">
                <span>Finalized financial position</span>
                <Badge variant={item.correctionReason ? "warning" : "success"}>Finalized · v{item.versionNumber}</Badge>
              </div>
              <div className="grid lg:grid-cols-[minmax(250px,1.15fr)_repeat(2,minmax(0,1fr))]">
                <div className="border-b px-5 py-7 sm:px-6 lg:row-span-2 lg:border-r lg:border-b-0 lg:py-8">
                  <p className="text-sm font-medium text-muted-foreground">Net owner position</p>
                  <p data-financial-value className="mt-3 text-[2.35rem] font-semibold leading-none tracking-[-0.05em] text-[var(--finance-accent)] sm:text-[2.8rem]">
                    {money(item.snapshot.netOwnerPositionMinor, item.snapshot.currencyCode)}
                  </p>
                  <p className="mt-4 max-w-xs text-xs leading-5 text-muted-foreground">Income less operating expenses and management fees for this immutable period.</p>
                </div>
                <div className="border-b px-5 py-5 sm:px-6 lg:border-r">
                  <p className="text-xs font-medium text-muted-foreground">Period income</p>
                  <p data-financial-value className="mt-2 text-xl font-semibold tracking-[-0.03em]">{money(item.snapshot.incomeMinor, item.snapshot.currencyCode)}</p>
                </div>
                <div className="border-b px-5 py-5 sm:px-6">
                  <p className="text-xs font-medium text-muted-foreground">Operating expenses</p>
                  <p data-financial-value className="mt-2 text-xl font-semibold tracking-[-0.03em]">{money(item.snapshot.expenseMinor, item.snapshot.currencyCode)}</p>
                </div>
                <div className="border-b px-5 py-5 sm:px-6 lg:border-r lg:border-b-0">
                  <p className="text-xs font-medium text-muted-foreground">Management fees</p>
                  <p data-financial-value className="mt-2 text-xl font-semibold tracking-[-0.03em]">{money(item.snapshot.managementFeeMinor, item.snapshot.currencyCode)}</p>
                </div>
                <div className="px-5 py-5 sm:px-6">
                  <p className="text-xs font-medium text-muted-foreground">Current owner payable</p>
                  <p data-financial-value className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--finance-accent)]">{money(item.ownerPayableMinor, item.snapshot.currencyCode)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">After recorded remittances</p>
                </div>
              </div>
            </section>

            <div className="overflow-hidden border-y bg-card sm:rounded-xl sm:border xl:grid xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
              <section aria-labelledby="account-summary-heading" className="min-w-0">
                <header className="border-b px-5 py-5 sm:px-6">
                  <h2 id="account-summary-heading" className="text-base font-semibold tracking-[-0.015em]">Account summary ledger</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.snapshot.sourceTransactionCount} posted transactions summarized into owner-visible accounts.</p>
                </header>

                <div className="divide-y md:hidden">
                  {item.snapshot.lines.map((line) => (
                    <div key={line.accountCode} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{line.accountCode} · {category(line.category)}</p>
                        <p className="mt-1 font-medium">{line.accountName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{line.transactionCount} {line.transactionCount === 1 ? "transaction" : "transactions"}</p>
                      </div>
                      <p data-financial-value className="font-semibold">{money(line.amountMinor, item.snapshot.currencyCode)}</p>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                    <thead className="border-b bg-[var(--surface-subtle)]/70 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-6 py-3">Account</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Entries</th>
                        <th className="px-6 py-3 text-right">Owner amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {item.snapshot.lines.map((line) => (
                        <tr key={line.accountCode}>
                          <td className="px-6 py-4"><span className="font-mono text-xs">{line.accountCode}</span><span className="mt-1 block text-xs text-muted-foreground">{category(line.category)}</span></td>
                          <td className="px-4 py-4 font-medium">{line.accountName}</td>
                          <td className="px-4 py-4 text-muted-foreground">{line.transactionCount}</td>
                          <td data-financial-value className="px-6 py-4 text-right font-semibold">{money(line.amountMinor, item.snapshot.currencyCode)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside aria-labelledby="record-integrity-heading" className="border-t bg-[var(--surface-subtle)]/45 px-5 py-5 sm:px-6 xl:border-t-0 xl:border-l">
                <div className="flex items-center gap-2"><FileLock2 aria-hidden="true" className="h-4 w-4 text-primary" /><h2 id="record-integrity-heading" className="text-sm font-semibold">Record integrity</h2></div>
                <dl className="mt-5 divide-y border-y text-sm">
                  <div className="py-3"><dt className="text-xs text-muted-foreground">Finalized</dt><dd className="mt-1 font-medium">{dateTime(item.finalizedAt)}</dd></div>
                  <div className="py-3"><dt className="text-xs text-muted-foreground">Statement version</dt><dd className="mt-1 font-medium">Version {item.versionNumber}</dd></div>
                  <div className="py-3"><dt className="text-xs text-muted-foreground">Source journal entries</dt><dd data-financial-value className="mt-1 font-medium">{item.snapshot.sourceEntryCount}</dd></div>
                  <div className="py-3"><dt className="text-xs text-muted-foreground">Source transactions</dt><dd data-financial-value className="mt-1 font-medium">{item.snapshot.sourceTransactionCount}</dd></div>
                </dl>
                <div className="mt-5"><p className="text-xs text-muted-foreground">Integrity hash</p><p className="mt-2 break-all font-mono text-[0.7rem] leading-5 text-foreground">{item.sha256Hex}</p></div>
              </aside>
            </div>

            <section aria-labelledby="remittances-heading" className="border-y bg-card sm:rounded-xl sm:border">
              <header className="border-b px-5 py-5 sm:flex sm:items-end sm:justify-between sm:gap-5 sm:px-6">
                <div><h2 id="remittances-heading" className="text-base font-semibold tracking-[-0.015em]">Recorded remittances</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Evidence-backed payments recorded outside Crecy for this statement series.</p></div>
                <p className="mt-3 text-xs text-muted-foreground sm:mt-0">{item.remittances.length} {item.remittances.length === 1 ? "record" : "records"}</p>
              </header>
              {item.remittances.length ? (
                <div className="divide-y">
                  {item.remittances.map((remittance) => (
                    <div key={remittance.remittanceId} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                      <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold"><ReceiptText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />{remittance.publicReference}</p><p className="mt-1 text-xs text-muted-foreground">Paid {date(remittance.paidOn)}{remittance.externalReference ? ` · ${remittance.externalReference}` : ""}</p></div>
                      <p data-financial-value className="text-lg font-semibold tracking-[-0.02em] text-[var(--finance-accent)]">{money(remittance.amountMinor, remittance.currencyCode)}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="px-5 py-8 text-sm text-muted-foreground sm:px-6">No remittance has been recorded for this statement series.</p>}
            </section>
          </>
        )}
      </article>
    </OwnerShell>
  );
}
