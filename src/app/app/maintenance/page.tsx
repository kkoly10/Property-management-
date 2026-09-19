import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CircleAlert,
  CircleCheckBig,
  ShieldCheck,
} from "lucide-react";
import { EmptyState } from "@/components/crecy/empty-state";
import { MetricStrip, type MetricStripItem } from "@/components/crecy/metric-strip";
import { OperatorAttentionRail, type OperatorAttentionItem } from "@/components/crecy/operator-attention-rail";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOperatorMaintenanceWorkspace, type OperatorMaintenanceItem } from "@/lib/data/maintenance";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

function priority(value: string): OperatorAttentionItem["priority"] {
  if (value === "emergency") return "critical";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  if (value === "low") return "low";
  return "neutral";
}

function queueItem(item: OperatorMaintenanceItem): OperatorAttentionItem {
  return {
    title: item.title,
    href: `/app/maintenance/${item.maintenanceRequestId}`,
    priority: priority(item.officialPriority),
    meta: (
      <>
        {item.propertyName} · Unit {item.unitCode} · {label(item.category)}
        <span aria-hidden="true"> · </span>
        {item.description}
        <span aria-hidden="true"> · </span>
        <span className="inline-flex items-center gap-1">
          <Camera aria-hidden="true" className="h-3.5 w-3.5" />
          {item.evidenceCount}
        </span>
      </>
    ),
    status: (
      <Badge variant={item.status === "new" ? "warning" : "info"}>
        {label(item.status)}
      </Badge>
    ),
  };
}

export default async function OperatorMaintenancePage() {
  const organizationId = await getActiveOrganizationId();
  const workspace = await getOperatorMaintenanceWorkspace(organizationId);
  const unassigned = workspace.items.filter((item) => !item.workOrder);
  const activeWork = workspace.items.filter((item) => Boolean(item.workOrder));
  const assigned = activeWork.length;

  const metrics: MetricStripItem[] = [
    {
      label: "Open requests",
      value: workspace.summary.open,
      detail: "Current unresolved resident issues",
      emphasis: workspace.summary.open > 0 ? "brand" : "default",
    },
    {
      label: "Needs triage",
      value: workspace.summary.untriaged,
      detail: "No work order has been opened yet",
      emphasis: workspace.summary.untriaged > 0 ? "warning" : "default",
    },
    {
      label: "Overdue",
      value: workspace.summary.overdue,
      detail: "Past the operating target",
      emphasis: workspace.summary.overdue > 0 ? "danger" : "default",
    },
    {
      label: "Assigned work",
      value: assigned,
      detail: "Requests with an active work order",
    },
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-7">
      <PageHeader
        context="Operations"
        title="Maintenance"
        description="Triage resident reports, open work orders, coordinate vendors, and keep completion evidence tied to the official record."
        meta={workspace.mode === "ready" ? `${workspace.items.length} request${workspace.items.length === 1 ? "" : "s"} in the current organization` : undefined}
      />

      {workspace.mode === "setup" ? (
        <Alert variant="info">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Maintenance preview</AlertTitle>
          <AlertDescription>This sample shows the operator intake queue until Supabase is connected.</AlertDescription>
        </Alert>
      ) : null}

      {workspace.mode === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Maintenance unavailable</AlertTitle>
          <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
        </Alert>
      ) : null}

      <MetricStrip items={metrics} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <WorkspacePanel
          title="Intake & triage"
          description="Resident reports that still need an official work order and vendor decision."
          actions={<Badge variant={unassigned.length ? "warning" : "success"}>{unassigned.length} waiting</Badge>}
          bodyClassName="px-4 sm:px-5"
        >
          {unassigned.length ? (
            <OperatorAttentionRail items={unassigned.map(queueItem)} />
          ) : (
            <EmptyState
              icon={CircleCheckBig}
              title="Triage queue is clear"
              description="Every open request currently has a work order."
              className="py-10"
            />
          )}
        </WorkspacePanel>

        <WorkspacePanel
          title="Work in motion"
          description="Assigned work orders and their current operating state."
          actions={<Badge variant="neutral">{activeWork.length} active</Badge>}
          bodyClassName="p-0"
        >
          {activeWork.length ? (
            <div className="divide-y">
              {activeWork.map((item) => {
                const workOrder = item.workOrder!;
                return (
                  <Link
                    key={item.maintenanceRequestId}
                    href={`/app/maintenance/${item.maintenanceRequestId}`}
                    className="group block px-5 py-4 transition-colors hover:bg-[var(--brand-subtle)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold tracking-[-0.01em] group-hover:text-primary">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.propertyName} · Unit {item.unitCode}</p>
                      </div>
                      <Badge variant={workOrder.status === "completed" || workOrder.status === "closed" ? "success" : "info"}>
                        {label(workOrder.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      <span>{workOrder.vendorName ?? "Vendor not assigned"}</span>
                      {workOrder.scheduledStart ? <span>{new Date(workOrder.scheduledStart).toLocaleString()}</span> : <span>Schedule pending</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No assigned work yet"
              description="Triage a resident request and assign a vendor to open the work-order lifecycle."
              className="py-10"
            />
          )}
        </WorkspacePanel>
      </div>

      <WorkspacePanel
        title="Request register"
        description="The full unresolved maintenance register, with resident-requested urgency kept separate from official operator priority."
        bodyClassName="p-0"
      >
        {workspace.items.length ? (
          /* Six columns at 860px left a phone showing only the request title, with the property,
             the official priority and the work-order state all past the right edge. Narrow
             containers keep the title, the work-order state and the link, and fold the property and
             the priority into the title cell so nothing an operator triages on is lost. */
          <div role="region" aria-label="Maintenance requests, scrollable" tabIndex={0} className="@container overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40">
            <table className="w-full border-collapse text-left text-sm @xl:min-w-[860px]">
              <thead className="border-b bg-[var(--surface-subtle)]/70 text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 sm:px-6">Request</th>
                  <th scope="col" className="hidden px-4 py-3 @xl:table-cell">Property</th>
                  <th scope="col" className="hidden px-4 py-3 @xl:table-cell">Requested</th>
                  <th scope="col" className="hidden px-4 py-3 @xl:table-cell">Official</th>
                  <th scope="col" className="px-4 py-3">Work order</th>
                  <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workspace.items.map((item) => (
                  <tr key={item.maintenanceRequestId} className="group transition-colors hover:bg-[var(--brand-subtle)]">
                    <td className="px-5 py-4 sm:px-6">
                      <Link href={`/app/maintenance/${item.maintenanceRequestId}`} className="font-semibold tracking-[-0.01em] group-hover:text-primary">
                        {item.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{item.publicReference} · {label(item.category)}</p>
                      {/* Shown only while the Property and Official columns are collapsed, so the
                          same facts are never announced twice. */}
                      <p className="mt-1 text-xs text-muted-foreground @xl:hidden">{item.propertyName} · Unit {item.unitCode}</p>
                      <p className="mt-1 text-xs font-medium text-foreground @xl:hidden">Priority: {label(item.officialPriority)}</p>
                    </td>
                    <td className="hidden px-4 py-4 @xl:table-cell">
                      <p className="font-medium">{item.propertyName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Unit {item.unitCode}</p>
                    </td>
                    <td className="hidden px-4 py-4 text-muted-foreground @xl:table-cell">{item.priorityRequested ? label(item.priorityRequested) : "Not set"}</td>
                    <td className="hidden px-4 py-4 @xl:table-cell">
                      <span className="font-semibold">{label(item.officialPriority)}</span>
                    </td>
                    <td className="px-4 py-4">
                      {item.workOrder ? (
                        <div>
                          <Badge variant="info">{label(item.workOrder.status)}</Badge>
                          <p className="mt-1 text-xs text-muted-foreground">{item.workOrder.vendorName ?? "Vendor pending"}</p>
                        </div>
                      ) : (
                        <Badge variant="warning">Needs triage</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/app/maintenance/${item.maintenanceRequestId}`}
                        aria-label={`Open ${item.title}`}
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
            icon={CircleCheckBig}
            title="No maintenance requests are waiting"
            description="New resident reports will enter the triage lane here."
          />
        )}
      </WorkspacePanel>
    </div>
  );
}
