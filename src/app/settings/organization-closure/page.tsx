import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getOrganizationClosureReadiness, type ClosureCounts, type WorkspaceClosureReview,
} from "@/lib/data/organization-closure";
import { saveWorkspaceClosureAction } from "./actions";

export const dynamic = "force-dynamic";

const sections: { title: string; items: [keyof ClosureCounts, string][] }[] = [
  { title: "Occupancy and signing", items: [
    ["occupiedTenancies", "Active or ending tenancies"],
    ["scheduledTenancies", "Scheduled tenancies"],
    ["pendingAgreements", "Open rental agreements"],
    ["pendingDocumentSignatures", "Pending document signatures"],
  ] },
  { title: "Financial obligations", items: [
    ["residentLedgerPositions", "Nonzero resident ledger positions"],
    ["openCharges", "Open or partially paid charges"],
    ["pendingPayments", "Pending payments"],
    ["unreconciledProviderPayments", "Unreconciled provider payments"],
    ["pendingRefunds", "Pending refunds"],
    ["openDisputes", "Open disputes"],
    ["pendingSettlements", "Pending or unreconciled settlements"],
    ["reconciliationExceptions", "Open reconciliation exceptions"],
    ["unresolvedDepositTenancies", "Tenancies with unresolved recorded deposits"],
    ["ownerLedgerPositions", "Nonzero owner ledger positions"],
  ] },
  { title: "Maintenance and privacy", items: [
    ["openWorkOrders", "Work orders awaiting closure"],
    ["pendingOwnerApprovals", "Pending owner approvals"],
    ["openPrivacyRequests", "Active privacy requests"],
    ["privacyCasesWithHolds", "Privacy cases with a recorded hold"],
  ] },
];

const statusLabels = { trial: "Trial", active: "Active", suspended: "Suspended", closing: "Closing", closed: "Closed" };
const reviewStates = { requested: "Review requested", reviewed: "Readiness reviewed", canceled: "Review canceled" };
const reviewActions = { request: "Request closure review", review: "Record current readiness", cancel: "Cancel closure review" };

function ClosureTime({ date }: { date: string }) {
  return <time dateTime={date}>{new Date(date).toISOString().slice(0, 16).replace("T", " ")} UTC</time>;
}

function ClosureReviewButton({
  review, action,
}: { review: WorkspaceClosureReview; action: keyof typeof reviewActions }) {
  return <form action={saveWorkspaceClosureAction}>
    <input type="hidden" name="organizationId" value={review.organizationId} />
    <input type="hidden" name="caseId" value={review.case?.caseId ?? ""} />
    <input type="hidden" name="caseVersion" value={review.case?.caseVersion ?? 0} />
    <input type="hidden" name="closureAction" value={action} />
    <input type="hidden" name="idempotencyKey" value={randomUUID()} />
    <Button type="submit" variant={action === "cancel" ? "outline" : "default"}>{reviewActions[action]}</Button>
  </form>;
}

function WorkspaceClosureReviewCard({
  review, workspaceName, canStart,
}: { review: WorkspaceClosureReview; workspaceName: string; canStart: boolean }) {
  const record = review.case;
  const active = record && record.status !== "canceled";
  const receipt = record?.reviewedReadiness;
  const snapshotCounts = receipt?.readiness.counts;
  const trackedFindings = snapshotCounts
    ? sections.flatMap(({ items }) => items.filter(([key]) => snapshotCounts[key] > 0))
    : [];

  return <Card>
    <CardHeader><CardTitle>Workspace closure review</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Request and document a readiness review for {workspaceName}. A separate process handles closure and retention decisions.
      </p>
      {record && <p className="text-sm">
        {reviewStates[record.status]} · <ClosureTime date={record.recordedAt} />
      </p>}
      {receipt && snapshotCounts && <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Saved readiness receipt</summary>
        <p className="mt-2 text-muted-foreground">
          Checked <ClosureTime date={receipt.readiness.checkedAt} /> · Version {receipt.caseVersion}
        </p>
        <p className="mt-1 break-all text-xs text-muted-foreground">Reference {record.caseId}</p>
        {trackedFindings.length === 0
          ? <p className="mt-2">No blockers found in tracked records at the time of review.</p>
          : <dl className="mt-2 divide-y">
            {trackedFindings.map(([key, label]) => <div key={key} className="flex justify-between gap-3 py-1">
              <dt>{label}</dt><dd className="font-medium tabular-nums">{snapshotCounts[key].toLocaleString("en-US")}</dd>
            </div>)}
          </dl>}
      </details>}
      <div className="flex flex-wrap gap-2">
        {active && <>
          <ClosureReviewButton review={review} action="review" />
          <ClosureReviewButton review={review} action="cancel" />
        </>}
        {!active && canStart && <ClosureReviewButton review={review} action="request" />}
      </div>
    </CardContent>
  </Card>;
}

export default async function OrganizationClosurePage({
  searchParams,
}: { searchParams: Promise<{ reviewError?: string }> }) {
  const workspace = await getOrganizationClosureReadiness();
  if (workspace.state === "workspace_required") redirect("/app");
  if (workspace.state === "sign_in_required") redirect("/login?next=%2Fsettings%2Forganization-closure");
  const { reviewError } = await searchParams;
  const reviewMessage = reviewError === "changed"
    ? "The workspace or review changed. Check the current details before taking another action."
    : "The review action could not be recorded. Refresh the page and try again.";

  return <main className="min-h-screen gutter-5 py-5 lg:gutter-8 lg:py-10">
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" asChild><Link href="/settings/payments"><ArrowLeft className="h-4 w-4" />Back to settings</Link></Button>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organization closure readiness</h1>
        {"workspaceName" in workspace && <p className="mt-2 text-muted-foreground">{workspace.workspaceName}</p>}
      </div>
      {workspace.state === "mfa_required" && <Alert variant="info">
        <LockKeyhole className="h-5 w-5" />
        <AlertTitle>Verify your authenticator</AlertTitle>
        <AlertDescription><Button variant="outline" size="sm" asChild>
          <Link href="/settings/security/mfa?returnTo=%2Fsettings%2Forganization-closure">Continue to security check</Link>
        </Button></AlertDescription>
      </Alert>}
      {workspace.state === "forbidden" && <Alert variant="info">
        <AlertTitle>Organization-wide administrator access is required</AlertTitle>
      </Alert>}
      {workspace.state === "unavailable" && <Alert variant="destructive">
        <AlertTitle>Closure readiness is temporarily unavailable</AlertTitle>
        <AlertDescription>Refresh to try again.</AlertDescription>
      </Alert>}
      {workspace.state === "ready" && <>
        {(workspace.reviewUnavailable || reviewError) && <Alert variant="destructive">
          <AlertTitle>{workspace.reviewUnavailable ? "Closure review is temporarily unavailable" : "Review action unavailable"}</AlertTitle>
          <AlertDescription>{workspace.reviewUnavailable ? "Refresh to try again." : reviewMessage}</AlertDescription>
        </Alert>}
        <Alert variant="info">
          <AlertTitle>{Object.values(workspace.readiness.counts).some((value) => value > 0)
            ? "Tracked items still need review" : "No blockers found in tracked records"}</AlertTitle>
          <AlertDescription>Review external financial obligations, retention requirements, and legal holds before closing an organization.</AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Workspace status {statusLabels[workspace.readiness.organizationStatus]} · Checked{" "}
          <ClosureTime date={workspace.readiness.checkedAt} />
        </p>
        {workspace.review && <WorkspaceClosureReviewCard
          review={workspace.review} workspaceName={workspace.workspaceName}
          canStart={workspace.readiness.organizationStatus !== "closing" && workspace.readiness.organizationStatus !== "closed"}
        />}
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map(({ title, items }) => <Card key={title}>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y">
                {items.map(([key, label]) => <div key={key} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <dt>{label}</dt><dd className="font-semibold tabular-nums">{workspace.readiness.counts[key].toLocaleString("en-US")}</dd>
                </div>)}
              </dl>
            </CardContent>
          </Card>)}
        </div>
      </>}
    </div>
  </main>;
}
