import { ArrowRight, CircleCheckBig, CreditCard, FileText, MessageSquareText, Wrench } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { LivingCommunityIdentity } from "@/components/crecy/living-community-identity";
import { MarketingProductStage } from "@/components/crecy/marketing-product-stage";
import { MetricStrip } from "@/components/crecy/metric-strip";
import { OperatorAttentionRail } from "@/components/crecy/operator-attention-rail";
import { OwnerFinancialBand } from "@/components/crecy/owner-financial-band";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Badge } from "@/components/ui/badge";

export function OperatorCommandCenterProof({ className = "" }: { className?: string }) {
  return (
    <MarketingProductStage
      label="Crecy OS · Command center"
      meta="Representative demo data"
      className={className}
    >
      <SurfaceTheme surface="os" className="bg-[var(--surface-canvas)]">
        <div className="grid min-h-[430px] grid-cols-[124px_minmax(0,1fr)] text-[10px] sm:grid-cols-[148px_minmax(0,1fr)]">
          <aside className="border-r bg-card p-3">
            <Wordmark className="max-w-[5.4rem]" />
            <div className="mt-5 space-y-4">
              {[
                ["Overview"],
                ["Portfolio", "Properties", "Residents", "Leases"],
                ["Operations", "Maintenance", "Messages"],
                ["Money", "Payments", "Owners"],
              ].map((group, groupIndex) => (
                <div key={groupIndex}>
                  {groupIndex > 0 ? <p className="mb-1.5 px-1 text-[8px] font-semibold text-muted-foreground">{group[0]}</p> : null}
                  <div className="space-y-0.5">
                    {(groupIndex === 0 ? group : group.slice(1)).map((item, itemIndex) => (
                      <div
                        key={item}
                        className={
                          groupIndex === 0 && itemIndex === 0
                            ? "border-l-2 border-primary bg-[var(--brand-subtle)] px-2 py-1.5 font-semibold text-foreground"
                            : "px-2 py-1.5 text-muted-foreground"
                        }
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex h-11 items-center border-b bg-card px-4">
              <div className="h-6 w-full max-w-[230px] rounded-md border bg-background px-2 py-1 text-[8px] text-muted-foreground">
                Search properties, residents, leases…
              </div>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              <div>
                <p className="text-[8px] font-medium text-muted-foreground">Maple Property Group</p>
                <p className="mt-1 text-sm font-semibold tracking-[-0.025em]">Command center</p>
              </div>

              <MetricStrip
                className="shadow-none"
                items={[
                  { label: "Occupancy", value: "94%", detail: "47 of 50 units" },
                  { label: "Open work", value: "7", detail: "3 need review", emphasis: "warning" },
                  { label: "Leases expiring", value: "4", detail: "Next 90 days" },
                  { label: "Owner approvals", value: "2", detail: "Awaiting decisions", emphasis: "brand" },
                ]}
              />

              <div className="grid gap-3 lg:grid-cols-[1.25fr_.75fr]">
                <WorkspacePanel title="Payments & reconciliation" bodyClassName="p-0" className="shadow-none">
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3 px-3 py-3">
                    <div>
                      <p className="text-[8px] text-muted-foreground">USD · selected period</p>
                      <p className="mt-1 text-base font-semibold tracking-[-0.03em]">$184,500</p>
                      <p className="mt-1 text-[8px] text-muted-foreground">Rent collected</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-warning">$12,750</p>
                      <p className="text-[8px] text-muted-foreground">Overdue now</p>
                    </div>
                  </div>
                  <div className="border-t px-3 py-2 text-[8px] font-medium text-primary">Review ledger →</div>
                </WorkspacePanel>

                <WorkspacePanel title="Needs attention" bodyClassName="px-2" className="shadow-none">
                  <OperatorAttentionRail
                    items={[
                      { title: "Owner approval requested", meta: "Maple Court · furnace repair", status: <Badge variant="warning">Pending</Badge> },
                      { title: "Reconciliation exception", meta: "Settlement amount mismatch", status: <Badge variant="neutral">Review</Badge> },
                    ]}
                  />
                </WorkspacePanel>
              </div>

              <div className="overflow-hidden rounded-lg border bg-card">
                <div className="grid grid-cols-[1fr_70px_80px] border-b bg-[var(--surface-subtle)] px-3 py-2 text-[8px] text-muted-foreground">
                  <span>Property</span><span>Occupancy</span><span>Open work</span>
                </div>
                {[
                  ["Maple Court", "96%", "2"],
                  ["Harbour Row", "92%", "4"],
                  ["Riverside", "95%", "1"],
                ].map((row) => (
                  <div key={row[0]} className="grid grid-cols-[1fr_70px_80px] border-b px-3 py-2 last:border-0">
                    <span className="font-medium">{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SurfaceTheme>
    </MarketingProductStage>
  );
}

export function LivingHomeProof({ className = "" }: { className?: string }) {
  return (
    <MarketingProductStage
      label="Crecy Living · Resident home"
      meta="Representative demo data"
      chrome="device"
      className={className}
    >
      <SurfaceTheme surface="living" className="bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-[390px] p-4">
          <div className="flex items-center justify-between pb-4">
            <Wordmark product="Living" className="max-w-[6.6rem]" />
            <span className="h-7 w-7 rounded-full border" />
          </div>

          <h3 className="text-xl font-semibold tracking-[-0.035em]">Welcome home.</h3>
          <p className="mt-1 text-xs text-muted-foreground">Everything about your home, in one calm place.</p>

          <LivingCommunityIdentity
            compact
            className="mt-5 rounded-xl border bg-card p-3"
            title="Maple Court"
            subtitle="Unit 101 · Your resident portal"
          />

          <div className="mt-3 overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-2">
              <div className="p-4">
                <p className="text-[10px] text-muted-foreground">Current balance</p>
                <p className="mt-1.5 text-xl font-semibold tracking-[-0.035em]">$1,425.00</p>
                <p className="mt-1 text-[10px] text-muted-foreground">USD</p>
              </div>
              <div className="border-l bg-[var(--brand-subtle)] p-4">
                <p className="text-[10px] text-muted-foreground">Upcoming payment</p>
                <p className="mt-1.5 text-base font-semibold">$1,425.00</p>
                <div className="mt-3 rounded-md bg-primary px-2 py-1.5 text-center text-[10px] font-semibold text-primary-foreground">
                  Make a payment
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 divide-y overflow-hidden rounded-xl border bg-card">
            {[
              [Wrench, "Maintenance requests", "1 open request"],
              [MessageSquareText, "Messages", "Property management"],
              [FileText, "Documents", "Lease, notices, records"],
            ].map(([Icon, title, detail]) => {
              const Glyph = Icon as typeof Wrench;
              return (
                <div key={String(title)} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-4 py-3">
                  <Glyph aria-hidden="true" className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs font-semibold">{String(title)}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{String(detail)}</p>
                  </div>
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-5 border-t pt-3 text-center text-[8px] text-muted-foreground">
            <span className="font-semibold text-primary">Home</span>
            <span>Payments</span>
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">+</span>
            <span>Messages</span>
            <span>More</span>
          </div>
        </div>
      </SurfaceTheme>
    </MarketingProductStage>
  );
}

export function OwnerOverviewProof({ className = "" }: { className?: string }) {
  return (
    <MarketingProductStage
      label="Crecy Owner · Financial overview"
      meta="Representative demo data"
      className={className}
    >
      <SurfaceTheme surface="owner" className="bg-[var(--surface-canvas)] p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <Wordmark product="Owner" className="max-w-[7.2rem]" />
          <span className="text-[9px] text-muted-foreground">Maple Court Holdings</span>
        </div>

        <div className="mt-5">
          <OwnerFinancialBand
            className="shadow-none"
            period="Latest finalized statement · Maple Court · Jun 2026 · USD"
            metrics={[
              { label: "Net owner position", value: "$7,245", tone: "finance" },
              { label: "Period income", value: "$9,250" },
              { label: "Operating expenses", value: "$1,265" },
              { label: "Owner payable", value: "$4,745", tone: "finance" },
            ]}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_.8fr]">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-[10px] font-semibold">Finalized statements</div>
            {[
              ["Maple Court", "Jun 2026", "$7,245"],
              ["Harbour Row", "Jun 2026", "$5,980"],
              ["Maple Court", "May 2026", "$7,080"],
            ].map((row) => (
              <div key={row.join("-")} className="grid grid-cols-[1fr_68px_64px] border-b px-3 py-2 text-[9px] last:border-0">
                <span className="font-medium">{row[0]}</span>
                <span className="text-muted-foreground">{row[1]}</span>
                <span className="text-right font-semibold text-[var(--finance-accent)]">{row[2]}</span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-[10px] font-semibold">Needs your decision</div>
            <div className="px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-semibold">Furnace repair</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">Maple Court · Unit 101</p>
                  <p className="mt-2 text-[10px] font-semibold text-[var(--finance-accent)]">$1,500</p>
                </div>
                <Badge variant="warning">Pending</Badge>
              </div>
              <div className="mt-3 border-t pt-2 text-right text-[8px] font-semibold text-primary">Review →</div>
            </div>
          </div>
        </div>
      </SurfaceTheme>
    </MarketingProductStage>
  );
}

export function WorkflowProof() {
  const steps = [
    ["01", "Resident reports", "Issue, photos, access preference"],
    ["02", "Operator triages", "Priority, vendor, schedule"],
    ["03", "Work is recorded", "Completion evidence and cost"],
    ["04", "Books stay aligned", "Expense and owner statement"],
  ];

  return (
    <ol className="mt-10 grid border-y sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(([number, title, detail], index) => (
        <li key={number} className={"relative px-1 py-6 sm:px-6 " + (index > 0 ? "border-t sm:border-t-0 sm:border-l" : "")}>
          <p className="text-xs font-semibold text-primary">{number}</p>
          <h3 className="mt-4 text-base font-semibold tracking-[-0.015em]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        </li>
      ))}
    </ol>
  );
}

export function TrustProof() {
  return (
    <div className="mt-10 divide-y border-y">
      {[
        ["Tenant isolation", "Organization-scoped rows and row-level security keep one operator's data out of another operator's workspace."],
        ["Relationship-scoped portals", "Residents and owners see projections of the same records, limited by the tenancy or ownership relationship."],
        ["Recorded changes", "Privileged state changes write audit history; posted financial records are corrected by reversal rather than silent edit."],
        ["Private documents", "Files stay private and are released through access-checked delivery and download paths."],
      ].map(([title, detail]) => (
        <div key={title} className="grid gap-2 py-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-8">
          <p className="text-sm font-semibold">{title}</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  );
}

export function RelationshipIndex() {
  return (
    <div className="mt-10 grid border-y md:grid-cols-3">
      {[
        ["01", "Crecy OS", "Operate", "Portfolio, money, leases, maintenance, communications and owner reporting."],
        ["02", "Crecy Living", "Live", "Balance, payments, requests, documents and the property relationship on a resident's phone."],
        ["03", "Crecy Owner", "Understand", "Finalized statements, recorded distributions and decisions tied to an owner's exact interests."],
      ].map(([number, name, verb, detail], index) => (
        <div key={name} className={"py-7 md:px-7 " + (index > 0 ? "border-t md:border-l md:border-t-0" : "")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary">{number}</span>
            <span className="text-xs font-medium text-muted-foreground">{verb}</span>
          </div>
          <h3 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">{name}</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  );
}

export function MoneyRail() {
  return (
    <div className="mt-10 overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-[1fr_auto] gap-6 border-b px-5 py-5 sm:px-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Payment lifecycle</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.02em]">One financial event, one traceable history.</p>
        </div>
        <CreditCard aria-hidden="true" className="h-5 w-5 text-primary" />
      </div>
      <div className="grid sm:grid-cols-4">
        {[
          ["Charge", "Rent due is posted"],
          ["Payment", "Funds are confirmed"],
          ["Allocation", "Payment is applied"],
          ["Statement", "Owner view reflects the posting"],
        ].map(([title, detail], index) => (
          <div key={title} className={"px-5 py-5 " + (index > 0 ? "border-t sm:border-l sm:border-t-0" : "")}>
            <div className="flex items-center gap-2">
              <CircleCheckBig aria-hidden="true" className="h-4 w-4 text-[var(--finance-accent)]" />
              <p className="text-sm font-semibold">{title}</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
