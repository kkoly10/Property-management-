import { MarketingProductStage } from "@/components/crecy/marketing-product-stage";
import { MetricStrip } from "@/components/crecy/metric-strip";
import { OperatorAttentionRail } from "@/components/crecy/operator-attention-rail";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import { Badge } from "@/components/ui/badge";

const operatingSteps = [
  ["01", "Establish the portfolio", "Properties, accounting books, units and staff scope"],
  ["02", "Bring the live relationships", "Residents, households, tenancies and existing leases"],
  ["03", "Run the money", "Charges, payments, allocations and reconciliation"],
  ["04", "Work the building", "Resident intake, triage, work orders and recorded cost"],
  ["05", "Keep the evidence", "Documents, delivery, acknowledgements and conversations"],
  ["06", "Close the owner record", "Finalized statements, remittances and decisions"],
] as const;

export function OperatingSequence() {
  return (
    <ol className="border-y">
      {operatingSteps.map(([number, title, detail]) => (
        <li key={number} className="grid gap-3 border-b py-5 last:border-b-0 sm:grid-cols-[48px_210px_1fr] sm:items-baseline">
          <span className="font-mono text-xs text-primary">{number}</span>
          <span className="font-semibold">{title}</span>
          <span className="text-sm leading-6 text-muted-foreground">{detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function PortfolioRegisterProof() {
  return (
    <MarketingProductStage label="Crecy OS · Portfolio register">
      <SurfaceTheme surface="os" className="bg-[var(--surface-canvas)] p-4 sm:p-6">
        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Maple Property Group · Toronto book · CAD</p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Portfolio register</h3>
          </div>
          <p className="text-xs text-muted-foreground">50 active units · 3 properties</p>
        </div>

        <MetricStrip
          className="mt-4 shadow-none"
          items={[
            { label: "Active properties", value: "3", detail: "One accounting book" },
            { label: "Occupied units", value: "47", detail: "94% occupancy" },
            { label: "Lease actions", value: "4", detail: "Next 90 days", emphasis: "brand" },
            { label: "Import exceptions", value: "2", detail: "Need operator review", emphasis: "warning" },
          ]}
        />

        <div
          role="region"
          aria-label="Portfolio register, scrollable"
          tabIndex={0}
          className="mt-4 min-w-0 max-w-full overflow-x-auto border-y bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead className="border-b bg-[var(--surface-subtle)] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Book</th>
                <th className="px-4 py-3 font-medium">Units</th>
                <th className="px-4 py-3 font-medium">Occupancy</th>
                <th className="px-4 py-3 font-medium">Current work</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["Maple Court", "Toronto · CAD", "24", "96%", "2 open · 1 urgent"],
                ["Harbour Row", "Toronto · CAD", "16", "94%", "4 open · 2 triage"],
                ["Riverside", "Toronto · CAD", "10", "90%", "1 scheduled"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="px-4 py-3 font-semibold">{row[0]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row[1]}</td>
                  <td className="px-4 py-3 tabular-nums">{row[2]}</td>
                  <td className="px-4 py-3 tabular-nums">{row[3]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceTheme>
    </MarketingProductStage>
  );
}

export function FinanceDeskProof() {
  return (
    <MarketingProductStage label="Crecy OS · Payments and reconciliation">
      <SurfaceTheme surface="os" className="bg-[var(--surface-canvas)] p-4 sm:p-6">
        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Maple Court · September 2026 · CAD</p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Money desk</h3>
          </div>
          <span className="text-xs font-medium text-[var(--finance-accent)]">Book balanced</span>
        </div>

        <div className="mt-4 grid border-y bg-card sm:grid-cols-3">
          {[
            ["Posted charges", "$34,200.00", "24 rent charges"],
            ["Confirmed receipts", "$31,350.00", "22 payments"],
            ["Outstanding", "$2,850.00", "2 resident balances"],
          ].map(([label, value, detail], index) => (
            <div key={label} className={`px-5 py-4 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p data-financial-value className="mt-2 text-xl font-semibold tracking-[-0.03em]">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>

        <div
          role="region"
          aria-label="Maintenance record, scrollable"
          tabIndex={0}
          className="mt-4 min-w-0 max-w-full overflow-x-auto border-y bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead className="border-b bg-[var(--surface-subtle)] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Record</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Accounting result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["September rent · Unit 101", "Recurring schedule", "$1,425.00", "Receivable posted"],
                ["Payment · Unit 101", "Connected account", "$1,425.00", "Allocated and confirmed"],
                ["Sink repair · Unit 204", "Completed work order", "$285.00", "Maintenance expense"],
                ["Owner remittance", "Finalized statement", "$7,245.00", "Recorded distribution"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="px-4 py-3 font-semibold">{row[0]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row[1]}</td>
                  <td data-financial-value className="px-4 py-3 text-right font-semibold">{row[2]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceTheme>
    </MarketingProductStage>
  );
}

export function MaintenanceDeskProof() {
  return (
    <MarketingProductStage label="Crecy OS · Maintenance control record">
      <SurfaceTheme surface="os" className="bg-[var(--surface-canvas)] p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="border-b pb-3">
              <p className="text-xs text-muted-foreground">Intake queue</p>
              <h3 className="mt-1 text-lg font-semibold">Work that needs a decision</h3>
            </div>
            <OperatorAttentionRail
              items={[
                { title: "Kitchen sink leak", meta: "Maple Court · Unit 101 · submitted 18m ago", priority: "high", status: <Badge variant="warning">Triage</Badge> },
                { title: "Hallway light", meta: "Harbour Row · common area · submitted yesterday", priority: "medium", status: <Badge variant="neutral">Assign</Badge> },
                { title: "Window latch", meta: "Riverside · Unit 3B · access confirmed", priority: "low", status: <Badge variant="neutral">Scheduled</Badge> },
              ]}
            />
          </div>

          <div className="border-y bg-card">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <p className="text-xs text-muted-foreground">WO-2048 · Maple Court · Unit 101</p>
                <h3 className="mt-1 font-semibold">Kitchen sink leak</h3>
              </div>
              <Badge variant="warning">In progress</Badge>
            </div>
            <dl className="divide-y px-5 text-sm">
              {[
                ["Resident report", "Active leak below basin; photo attached"],
                ["Operator decision", "Urgent · approved for assignment"],
                ["Vendor scope", "Inspect supply and drain connections"],
                ["Financial boundary", "Record actual cost after completion"],
                ["Owner boundary", "Approval required only above configured threshold"],
              ].map(([term, detail]) => (
                <div key={term} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr] sm:gap-5">
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </SurfaceTheme>
    </MarketingProductStage>
  );
}

export function RecordContinuityProof() {
  const rows = [
    ["Lease version", "Operator document register", "Resident delivery", "Exact delivered version retained"],
    ["Building notice", "Announcement register", "Resident audience", "Sender and delivery time recorded"],
    ["Maintenance cost", "Posted journal transaction", "Owner statement", "Same property-tagged entry"],
    ["Owner decision", "Approval dossier", "Operator work order", "Decision and chronology retained"],
  ];

  return (
    <div
      role="region"
      aria-label="Record continuity, scrollable"
      tabIndex={0}
      className="min-w-0 max-w-full overflow-x-auto border-y focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="py-3 pr-5 font-medium">Record</th>
            <th className="px-5 py-3 font-medium">Created in</th>
            <th className="px-5 py-3 font-medium">Visible through</th>
            <th className="py-3 pl-5 font-medium">Continuity</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row[0]}>
              <td className="py-4 pr-5 font-semibold">{row[0]}</td>
              <td className="px-5 py-4 text-muted-foreground">{row[1]}</td>
              <td className="px-5 py-4 text-muted-foreground">{row[2]}</td>
              <td className="py-4 pl-5 text-muted-foreground">{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
