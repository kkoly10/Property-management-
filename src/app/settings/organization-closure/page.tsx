import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrganizationClosureReadiness, type ClosureCounts } from "@/lib/data/organization-closure";

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

export default async function OrganizationClosurePage() {
  const workspace = await getOrganizationClosureReadiness();
  if (workspace.state === "workspace_required") redirect("/app");
  if (workspace.state === "sign_in_required") redirect("/login?next=%2Fsettings%2Forganization-closure");

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
        <Alert variant="info">
          <AlertTitle>{Object.values(workspace.readiness.counts).some((value) => value > 0)
            ? "Tracked items still need review" : "No blockers found in tracked records"}</AlertTitle>
          <AlertDescription>Review external financial obligations, retention requirements, and legal holds before closing an organization.</AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Workspace status {statusLabels[workspace.readiness.organizationStatus]} · Checked{" "}
          <time dateTime={workspace.readiness.checkedAt}>{new Date(workspace.readiness.checkedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</time>
        </p>
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
