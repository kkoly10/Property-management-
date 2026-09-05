import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileSignature,
  MapPin,
} from "lucide-react";
import { LivingCommunityForm } from "@/app/app/properties/[propertyId]/living-community-form";
import { UnitForm } from "@/app/app/properties/unit-form";
import { EmptyState } from "@/components/crecy/empty-state";
import { MetricStrip, type MetricStripItem } from "@/components/crecy/metric-strip";
import { PageHeader } from "@/components/crecy/page-header";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOperatorLivingCommunityProfile } from "@/lib/data/living-community";
import { getPropertyWorkspace } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

const rent = (amountMinor: number, currencyCode: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: currencyCode,
  maximumFractionDigits: 0,
}).format(amountMinor / 100);

export default async function PropertyWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ unit_created?: string }>;
}) {
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  const [workspace, livingCommunity] = await Promise.all([
    getPropertyWorkspace(propertyId),
    getOperatorLivingCommunityProfile(propertyId),
  ]);

  if (workspace.mode === "ready" && !workspace.property) notFound();
  if (!workspace.property) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" className="h-5 w-5" />
        <AlertTitle>Property unavailable</AlertTitle>
        <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
      </Alert>
    );
  }

  const property = workspace.property;
  const occupancyByUnit = new Map(workspace.occupancies.map((occupancy) => [occupancy.unitId, occupancy]));
  const occupancyRate = property.unitCount > 0
    ? Math.round((workspace.occupancies.length / property.unitCount) * 100)
    : null;

  const metrics: MetricStripItem[] = [
    {
      label: "Units",
      value: property.unitCount,
      detail: "Active operational units",
    },
    {
      label: "Occupancy",
      value: occupancyRate == null ? "—" : `${occupancyRate}%`,
      detail: `${workspace.occupancies.length} occupied relationship${workspace.occupancies.length === 1 ? "" : "s"}`,
      emphasis: occupancyRate != null && occupancyRate < 90 ? "warning" : "default",
    },
    {
      label: "Book currency",
      value: property.currencyCode,
      detail: property.bookName,
      emphasis: "finance",
    },
    {
      label: "Property status",
      value: property.status.replaceAll("_", " "),
      detail: `${property.countryCode}${property.subdivisionCode ? ` · ${property.subdivisionCode}` : ""}`,
      emphasis: property.status === "active" ? "brand" : "default",
    },
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-7">
      <PageHeader
        context={
          <Link href="/app/properties" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Properties
          </Link>
        }
        title={property.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <MapPin aria-hidden="true" className="h-4 w-4" />
            {property.addressLine1}, {[property.locality, property.subdivisionCode, property.postalCode].filter(Boolean).join(", ")}
          </span>
        }
        actions={
          <Button asChild>
            <Link href={`/app/leases/record?propertyId=${property.id}`}>
              <FileSignature aria-hidden="true" className="h-4 w-4" />
              Record lease
            </Link>
          </Button>
        }
      />

      {workspace.mode === "setup" ? (
        <Alert variant="info">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Property preview</AlertTitle>
          <AlertDescription>This safe sample shows the final workspace until Supabase is connected.</AlertDescription>
        </Alert>
      ) : null}

      {query.unit_created ? (
        <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success">
          <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Unit added</AlertTitle>
          <AlertDescription>The active-unit usage meter and audit timeline were updated in the same transaction.</AlertDescription>
        </Alert>
      ) : null}

      <MetricStrip items={metrics} />

      <nav aria-label="Property sections" className="flex gap-5 overflow-x-auto border-b text-sm">
        {[
          ["Foundation", "#foundation"],
          ["Resident portal", "#resident-portal"],
          [`Units · ${workspace.units.length}`, "#units"],
          [`Residents & leases · ${workspace.occupancies.length}`, "#residents"],
        ].map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 border-b-2 border-transparent py-3 font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <WorkspacePanel
            title="Property foundation"
            description="The accounting and jurisdiction anchors inherited by leases, payments, and reports."
            bodyClassName="p-0"
            className="scroll-mt-28"
          >
            <dl id="foundation" className="grid sm:grid-cols-2">
              {[
                ["Accounting book", property.bookName, property.currencyCode],
                ["Jurisdiction", `${property.countryCode}${property.subdivisionCode ? ` · ${property.subdivisionCode}` : ""}`, property.timeZone],
                ["Property type", property.propertyType.replaceAll("_", " "), "Operational classification"],
                ["Address", property.addressLine1, [property.locality, property.postalCode].filter(Boolean).join(" · ") || "Address on file"],
              ].map(([term, value, detail], index) => (
                <div
                  key={term}
                  className={`px-5 py-4 sm:px-6 ${
                    index === 1 ? "border-t sm:border-t-0 sm:border-l" :
                    index === 2 ? "border-t" :
                    index === 3 ? "border-t sm:border-l" : ""
                  }`}
                >
                  <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
                  <dd className="mt-1.5 text-sm font-semibold tracking-[-0.01em]">{value}</dd>
                  <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </WorkspacePanel>

          <WorkspacePanel
            title="Resident portal"
            description="Control the public-safe Crecy Living identity residents see for this property."
            className="scroll-mt-28"
          >
            <div id="resident-portal" className="space-y-5">
              {livingCommunity.mode === "unavailable" ? (
                <Alert variant="warning">
                  <CircleAlert aria-hidden="true" className="h-5 w-5" />
                  <AlertTitle>Community publishing setup pending</AlertTitle>
                  <AlertDescription>
                    The operator controls are built, but the Living community migration has not been applied to this Crecy database yet. These controls stay read-only until that runtime contract is present.
                  </AlertDescription>
                </Alert>
              ) : null}
              {livingCommunity.mode === "error" ? (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden="true" className="h-5 w-5" />
                  <AlertTitle>Resident portal settings unavailable</AlertTitle>
                  <AlertDescription>Refresh and try again. Request {livingCommunity.requestId}.</AlertDescription>
                </Alert>
              ) : null}
              {livingCommunity.mode === "setup" ? (
                <Alert variant="info">
                  <CircleAlert aria-hidden="true" className="h-5 w-5" />
                  <AlertTitle>Resident portal preview</AlertTitle>
                  <AlertDescription>Connect the Crecy Supabase project to save and publish operator-managed community profiles.</AlertDescription>
                </Alert>
              ) : null}

              <LivingCommunityForm
                propertyId={property.id}
                propertyName={property.name}
                profile={livingCommunity.profile}
                disabled={livingCommunity.mode !== "ready"}
              />
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Units"
            description="Operational status and current household occupancy."
            bodyClassName="p-0"
            className="scroll-mt-28"
          >
            <div id="units">
              {workspace.units.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                    <thead className="border-b bg-[var(--surface-subtle)]/70 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 sm:px-6">Unit</th>
                        <th className="px-4 py-3">Details</th>
                        <th className="px-4 py-3">Household</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {workspace.units.map((unit) => {
                        const occupancy = occupancyByUnit.get(unit.id);
                        const details = [
                          unit.unitType,
                          unit.bedrooms !== null ? `${unit.bedrooms} bd` : null,
                          unit.bathrooms !== null ? `${unit.bathrooms} ba` : null,
                          unit.squareFeet !== null ? `${unit.squareFeet.toLocaleString()} sq ft` : null,
                        ].filter(Boolean).join(" · ") || "Details not added";

                        return (
                          <tr key={unit.id} className="transition-colors hover:bg-[var(--brand-subtle)]">
                            <td className="px-5 py-4 font-semibold sm:px-6">Unit {unit.unitCode}</td>
                            <td className="px-4 py-4 text-muted-foreground">{details}</td>
                            <td className="px-4 py-4">{occupancy?.householdName ?? <span className="text-muted-foreground">Vacant</span>}</td>
                            <td className="px-4 py-4">
                              <Badge variant={occupancy ? "info" : unit.status === "active" ? "success" : "neutral"}>
                                {occupancy ? "occupied" : unit.status.replaceAll("_", " ")}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No units yet"
                  description="Add the first operational unit from the property controls."
                />
              )}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title="Residents & leases"
            description="Active and scheduled household relationships in this property."
            bodyClassName="p-0"
            className="scroll-mt-28"
          >
            <div id="residents">
              {workspace.occupancies.length ? (
                <div className="divide-y">
                  {workspace.occupancies.map((occupancy) => (
                    <div
                      key={occupancy.tenancyId}
                      className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold tracking-[-0.01em]">{occupancy.householdName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Unit {occupancy.unitCode}</p>
                      </div>
                      <div className="text-sm">
                        <p>{occupancy.leaseStart} → {occupancy.leaseEnd ?? "ongoing"}</p>
                        <p data-financial-value className="mt-1 text-xs font-medium text-muted-foreground">
                          {rent(occupancy.rentAmountMinor, occupancy.currencyCode)}
                        </p>
                      </div>
                      <Badge variant={occupancy.tenancyStatus === "active" ? "success" : "neutral"}>
                        {occupancy.tenancyStatus.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No resident relationships yet"
                  description="Activate an existing signed lease to connect a household to a unit."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/leases/record?propertyId=${property.id}`}>
                        Record lease <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </Button>
                  }
                />
              )}
            </div>
          </WorkspacePanel>
        </div>

        <aside className="h-fit xl:sticky xl:top-28">
          <WorkspacePanel
            title="Add a unit"
            description="Plan-checked, idempotent, audited, and property-scoped."
            bodyClassName="p-5 sm:p-6"
          >
            <UnitForm organizationId={property.organizationId} propertyId={property.id} />
          </WorkspacePanel>
        </aside>
      </div>
    </div>
  );
}
