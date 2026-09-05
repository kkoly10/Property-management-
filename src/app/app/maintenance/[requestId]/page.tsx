import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CircleAlert,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { MetricStrip, type MetricStripItem } from "@/components/crecy/metric-strip";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getOperatorVendorDirectory, getOperatorWorkOrderDetail } from "@/lib/data/maintenance";
import { getOperatorOwnerApprovalWorkspace } from "@/lib/data/owner-approvals";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { AssignVendorForm } from "./assign-vendor-form";
import { RecordCostForm } from "./record-cost-form";
import { WorkOrderActions } from "./work-order-actions";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");
const money = (amountMinor: number, currencyCode: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: currencyCode,
}).format(amountMinor / 100);

function priorityEmphasis(priority: string): MetricStripItem["emphasis"] {
  if (priority === "emergency") return "danger";
  if (priority === "high" || priority === "medium") return "warning";
  return "default";
}

export default async function OperatorMaintenanceDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const organizationId = await getActiveOrganizationId();
  const { requestId } = await params;
  const [detail, directory, approvalWorkspace] = await Promise.all([
    getOperatorWorkOrderDetail(organizationId, requestId),
    getOperatorVendorDirectory(organizationId),
    getOperatorOwnerApprovalWorkspace(organizationId),
  ]);

  if (detail.mode === "ready" && !detail.item) notFound();
  const item = detail.item;
  const approvals = item?.workOrder
    ? approvalWorkspace.items.filter((approval) => approval.workOrderId === item.workOrder?.workOrderId)
    : [];

  if (detail.mode === "error" || !item) {
    return (
      <div className="mx-auto max-w-[1480px] space-y-6">
        <Link href="/app/maintenance" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Maintenance
        </Link>
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Maintenance request unavailable</AlertTitle>
          <AlertDescription>Refresh and try again. Request {detail.requestId}.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const workOrder = item.workOrder;
  const costAmount = workOrder?.cost?.amountMinor
    ?? workOrder?.actualCostMinor
    ?? workOrder?.estimatedCostMinor
    ?? null;
  const costCurrency = workOrder?.cost?.currencyCode ?? workOrder?.currencyCode ?? null;

  const metrics: MetricStripItem[] = [
    {
      label: "Request status",
      value: label(item.status),
      detail: item.publicReference,
      emphasis: item.status === "new" ? "warning" : "brand",
    },
    {
      label: "Official priority",
      value: label(item.officialPriority),
      detail: item.priorityRequested ? `Resident requested ${label(item.priorityRequested)}` : "No resident priority supplied",
      emphasis: priorityEmphasis(item.officialPriority),
    },
    {
      label: "Work order",
      value: workOrder ? label(workOrder.status) : "Not opened",
      detail: workOrder?.vendorName ?? "Vendor assignment pending",
      emphasis: workOrder ? "brand" : "warning",
    },
    {
      label: "Cost / approval",
      value: costAmount != null && costCurrency ? money(costAmount, costCurrency) : "—",
      detail: workOrder?.ownerApprovalRequired
        ? `Owner approval ${workOrder.ownerApprovalStatus ?? "pending"}`
        : workOrder ? "No owner approval required" : "Available after work order creation",
      emphasis: costAmount != null ? "finance" : "default",
    },
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-7">
      <PageHeader
        context={
          <Link href="/app/maintenance" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Maintenance
          </Link>
        }
        title={item.title}
        description={`${item.propertyName} · Unit ${item.unitCode} · ${label(item.category)}`}
        meta={`Reported ${new Date(item.createdAt).toLocaleString()}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant={item.status === "new" ? "warning" : "info"}>{label(item.status)}</Badge>
            <Badge variant="neutral">Priority · {label(item.officialPriority)}</Badge>
          </div>
        }
      />

      {detail.mode === "setup" ? (
        <Alert variant="info">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Work order preview</AlertTitle>
          <AlertDescription>This sample shows the assignment and status controls until Supabase is connected.</AlertDescription>
        </Alert>
      ) : null}

      <MetricStrip items={metrics} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_minmax(360px,.78fr)]">
        <div className="space-y-6">
          <WorkspacePanel
            title="Resident report"
            description="The original issue and access context remain visible beside the official operator state."
            bodyClassName="p-5 sm:p-6"
          >
            <p className="text-sm leading-7">{item.description}</p>
            <dl className="mt-5 grid border-y sm:grid-cols-3">
              <div className="py-3 sm:pr-4">
                <dt className="text-xs text-muted-foreground">Requested priority</dt>
                <dd className="mt-1 text-sm font-semibold">{item.priorityRequested ? label(item.priorityRequested) : "Not set"}</dd>
              </div>
              <div className="border-t py-3 sm:border-t-0 sm:border-l sm:px-4">
                <dt className="text-xs text-muted-foreground">Access instructions</dt>
                <dd className="mt-1 text-sm font-semibold">{item.accessPermission ?? "None recorded"}</dd>
              </div>
              <div className="border-t py-3 sm:border-t-0 sm:border-l sm:pl-4">
                <dt className="text-xs text-muted-foreground">Resident evidence</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                  {item.evidenceCount} photo{item.evidenceCount === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>
          </WorkspacePanel>

          {workOrder ? (
            <WorkspacePanel
              title={`Work order ${workOrder.publicReference}`}
              description={workOrder.vendorName ? `Assigned to ${workOrder.vendorName}` : "Vendor assignment pending"}
              actions={
                workOrder.ownerApprovalRequired
                  ? <Badge variant={workOrder.ownerApprovalStatus === "approved" ? "success" : "warning"}>Owner approval {workOrder.ownerApprovalStatus ?? "pending"}</Badge>
                  : undefined
              }
              bodyClassName="p-0"
            >
              <dl className="divide-y">
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:px-6">
                  <dt className="text-xs font-medium text-muted-foreground">Scope</dt>
                  <dd className="text-sm leading-6">{workOrder.scope}</dd>
                </div>
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:px-6">
                  <dt className="text-xs font-medium text-muted-foreground">Schedule</dt>
                  <dd className="text-sm">
                    {workOrder.scheduledStart
                      ? `${new Date(workOrder.scheduledStart).toLocaleString()} – ${workOrder.scheduledEnd ? new Date(workOrder.scheduledEnd).toLocaleString() : "open-ended"}`
                      : "Not scheduled"}
                  </dd>
                </div>
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:px-6">
                  <dt className="text-xs font-medium text-muted-foreground">Cost record</dt>
                  <dd className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {workOrder.estimatedCostMinor !== null && workOrder.currencyCode
                      ? <span>Estimate {money(workOrder.estimatedCostMinor, workOrder.currencyCode)}</span>
                      : null}
                    {workOrder.actualCostMinor !== null && workOrder.currencyCode
                      ? <span>Actual {money(workOrder.actualCostMinor, workOrder.currencyCode)}</span>
                      : null}
                    {workOrder.cost
                      ? <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--finance-accent)]"><Receipt aria-hidden="true" className="h-3.5 w-3.5" />Posted {money(workOrder.cost.amountMinor, workOrder.cost.currencyCode)}</span>
                      : null}
                    {workOrder.estimatedCostMinor === null && workOrder.actualCostMinor === null && !workOrder.cost
                      ? <span className="text-muted-foreground">No cost recorded</span>
                      : null}
                  </dd>
                </div>
                {workOrder.completionSummary ? (
                  <div className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:px-6">
                    <dt className="text-xs font-medium text-muted-foreground">Completion notes</dt>
                    <dd className="text-sm leading-6">{workOrder.completionSummary}</dd>
                  </div>
                ) : null}
                {workOrder.canceledReason ? (
                  <div className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:px-6">
                    <dt className="text-xs font-medium text-muted-foreground">Cancellation</dt>
                    <dd className="text-sm leading-6">{workOrder.canceledReason}</dd>
                  </div>
                ) : null}
              </dl>
            </WorkspacePanel>
          ) : null}

          {approvals.length ? (
            <WorkspacePanel
              title="Owner approvals"
              description="Each request stays isolated to its exact owner entity."
              bodyClassName="p-0"
            >
              <div className="divide-y">
                {approvals.map((approval) => (
                  <div key={approval.approvalRequestId} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                    <div>
                      <p className="font-semibold">{approval.ownerName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Requested {new Date(approval.requestedAt).toLocaleString()}
                        {approval.decidedAt ? ` · Decided ${new Date(approval.decidedAt).toLocaleString()}` : ""}
                      </p>
                      {approval.reason ? <p className="mt-2 text-sm text-muted-foreground">{approval.reason}</p> : null}
                    </div>
                    <Badge variant={approval.status === "approved" ? "success" : approval.status === "rejected" ? "neutral" : "warning"}>
                      {label(approval.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </WorkspacePanel>
          ) : null}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          {workOrder ? (
            <>
              <WorkOrderActions
                key={`${workOrder.workOrderId}:${workOrder.version}`}
                workOrderId={workOrder.workOrderId}
                organizationId={item.organizationId}
                status={workOrder.status}
                version={workOrder.version}
                disabled={detail.mode !== "ready"}
              />
              {["completed", "closed"].includes(workOrder.status) && !workOrder.cost ? (
                <RecordCostForm
                  workOrderId={workOrder.workOrderId}
                  organizationId={item.organizationId}
                  defaultCurrencyCode={workOrder.currencyCode}
                  suggestedAmountMinor={workOrder.actualCostMinor ?? workOrder.estimatedCostMinor}
                  disabled={detail.mode !== "ready"}
                />
              ) : null}
            </>
          ) : (
            <AssignVendorForm
              maintenanceRequestId={item.maintenanceRequestId}
              organizationId={item.organizationId}
              vendors={directory.vendors}
              disabled={detail.mode !== "ready"}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
