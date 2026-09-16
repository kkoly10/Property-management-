import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, CircleAlert, Clock3, FileCheck2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOwnerApprovalDetail } from "@/lib/data/owner-approvals";
import { OwnerApprovalForm } from "./owner-approval-form";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
const timestamp = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value));

export default async function OwnerApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const detail = await getOwnerApprovalDetail(approvalId);
  if (detail.mode === "ready" && !detail.item) notFound();
  const item = detail.item;

  return (
    <OwnerShell chromeTitle="Owner decisions" chromeDescription="Work-order scope, evidence, and approvals">
      <div className="space-y-7">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/owner#approvals"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Approvals</Link>
        </Button>

        {detail.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Approval preview</AlertTitle>
            <AlertDescription>The sample decision controls are disabled until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}

        {detail.mode === "error" || !item ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Approval unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription>
          </Alert>
        ) : (
          <>
            <PageHeader
              context={`${item.ownerName} · ${item.propertyName}${item.unitCode ? ` · Unit ${item.unitCode}` : ""}`}
              title="Work-order decision dossier"
              description="Review the exact requested scope, financial exposure, and available evidence before recording an owner decision."
              meta={`${item.workOrderReference} · ${label(item.approvalType)}`}
              actions={(
                <Badge variant={item.status === "approved" ? "success" : item.status === "rejected" ? "neutral" : "warning"}>
                  {label(item.status)}
                </Badge>
              )}
            />

            <article className="overflow-hidden border-y bg-card sm:rounded-xl sm:border lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
              <div className="min-w-0">
                <section aria-labelledby="requested-scope-heading" className="px-5 py-6 sm:px-6 sm:py-7">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileCheck2 aria-hidden="true" className="h-4 w-4 text-primary" />
                    <span>{label(item.approvalType)}</span>
                  </div>
                  <h2 id="requested-scope-heading" className="mt-4 text-lg font-semibold tracking-[-0.02em]">Requested scope</h2>
                  <p className="mt-3 max-w-3xl text-base leading-7 text-foreground">{item.scope}</p>
                </section>

                <section aria-label="Approval facts" className="grid border-t sm:grid-cols-3">
                  <div className="border-b px-5 py-5 sm:border-r sm:border-b-0 sm:px-6">
                    <p className="text-xs font-medium text-muted-foreground">Requested amount</p>
                    {item.amountMinor !== null && item.currencyCode ? (
                      <p data-financial-value className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--finance-accent)]">{money(item.amountMinor, item.currencyCode)}</p>
                    ) : <p className="mt-2 text-sm font-medium">No amount supplied</p>}
                  </div>
                  <div className="border-b px-5 py-5 sm:border-r sm:border-b-0 sm:px-6">
                    <p className="text-xs font-medium text-muted-foreground">Evidence on record</p>
                    <p className="mt-2 flex items-center gap-2 text-base font-semibold"><Camera aria-hidden="true" className="h-4 w-4 text-muted-foreground" />{item.evidenceCount} {item.evidenceCount === 1 ? "file" : "files"}</p>
                  </div>
                  <div className="px-5 py-5 sm:px-6">
                    <p className="text-xs font-medium text-muted-foreground">Work-order state</p>
                    <p className="mt-2 text-sm font-semibold">{label(item.workOrderStatus)}</p>
                  </div>
                </section>

                <section aria-labelledby="chronology-heading" className="border-t px-5 py-6 sm:px-6">
                  <h2 id="chronology-heading" className="text-sm font-semibold">Request chronology</h2>
                  <ol className="mt-5 border-l pl-5">
                    <li className="relative pb-6">
                      <span aria-hidden="true" className="absolute -left-[1.43rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                      <p className="text-sm font-medium">Decision requested</p>
                      <p className="mt-1 text-xs text-muted-foreground">{timestamp(item.requestedAt)}</p>
                    </li>
                    <li className="relative">
                      <span aria-hidden="true" className={`absolute -left-[1.43rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-card ${item.decidedAt ? "bg-[var(--finance-accent)]" : "bg-muted-foreground/35"}`} />
                      <p className="text-sm font-medium">{item.decidedAt ? `Decision recorded · ${label(item.status)}` : "Awaiting owner decision"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.decidedAt ? timestamp(item.decidedAt) : "No decision has been recorded."}</p>
                      {item.reason ? <p className="mt-3 border-l-2 border-[var(--finance-accent)] pl-3 text-sm leading-6 text-muted-foreground">{item.reason}</p> : null}
                    </li>
                  </ol>
                </section>
              </div>

              <aside aria-labelledby="decision-heading" className="border-t bg-[var(--surface-subtle)]/45 lg:border-t-0 lg:border-l">
                <div className="sticky top-28 px-5 py-6 sm:px-6 sm:py-7">
                  <div className="flex items-center gap-2">
                    <Clock3 aria-hidden="true" className="h-4 w-4 text-primary" />
                    <h2 id="decision-heading" className="text-base font-semibold">{item.status === "pending" ? "Record your decision" : "Decision record"}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.status === "pending"
                      ? "This action is limited to a user related to this exact owner entity. Rejection requires a comment."
                      : `This request is ${item.status}. The recorded result is final on this request.`}
                  </p>
                  <div className="mt-6 border-t pt-6">
                    {item.status === "pending" ? (
                      <OwnerApprovalForm approvalRequestId={item.approvalRequestId} version={item.version} disabled={detail.mode !== "ready"} />
                    ) : (
                      <Alert variant={item.status === "approved" ? "success" : "warning"}>
                        <AlertTitle>{label(item.status)}</AlertTitle>
                        <AlertDescription>No further decision can be recorded for this request.</AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </aside>
            </article>
          </>
        )}
      </div>
    </OwnerShell>
  );
}
