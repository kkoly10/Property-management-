const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const relationshipRows = [
  ["Portfolio operations", "Full organization context", "Outside scope", "Outside scope"],
  ["Lease / tenancy", "Operational record", "Own active tenancy", "Outside scope"],
  ["Resident identity", "Permitted operational fields", "Own account", "Outside scope"],
  ["Owner reporting", "Statement + remittance workspace", "Outside scope", "Own property interest"],
  ["Property documents", "Access by role and property", "Delivered recipient versions", "Delivered owner versions"],
] as const;

const assuranceRows = [
  ["Tenant isolation", "Row policies, scoped commands and negative tests", "Built control"],
  ["Financial integrity", "Append-only postings, reversals and idempotency", "Built control"],
  ["Document handling", "Private storage, quarantine and scan lifecycle", "Built control"],
  ["SOC 2", "No independent report currently held", "Not claimed"],
  ["Published uptime", "No declared monitoring period yet", "Not claimed"],
  ["Penetration test", "No signed report and remediation record yet", "Not claimed"],
] as const;

function BoundaryCell({
  title,
  detail,
  quiet = false,
}: {
  title: string;
  detail: string;
  quiet?: boolean;
}) {
  return (
    <div className={`min-h-32 p-5 sm:p-6 ${quiet ? "bg-muted/45" : "bg-card"}`}>
      <p className="text-base font-semibold tracking-[-0.02em]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function PropertyAccessBoundary() {
  return (
    <figure className="overflow-hidden border-y bg-card">
      {/* The property record spans the figure, and the three projections sit beneath it rather than
          beside it. They used to share a 1.15fr sub-column, which left each cell 56px of text width at
          1024px and 96px at 1440px — one sentence wrapping over eight to eleven lines. Reading order is
          now the same at every width: the record, then the three views of it. */}
      <div className="border-b p-6 sm:p-8">
        <p className="text-xs font-medium text-muted-foreground">Property record</p>
        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Maple Court</p>
        <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-4 sm:gap-x-8">
          <div><dt className="text-muted-foreground">Organization</dt><dd className="mt-1 font-medium">Maple Property Group</dd></div>
          <div><dt className="text-muted-foreground">Accounting book</dt><dd className="mt-1 font-medium">Toronto · CAD</dd></div>
          <div><dt className="text-muted-foreground">Units</dt><dd className="mt-1 font-medium">24</dd></div>
          <div><dt className="text-muted-foreground">Access rule</dt><dd className="mt-1 font-medium">Relationship + scope</dd></div>
        </dl>
      </div>
      {/* Three-across only once the figure is genuinely wide, for two different reasons either side
          of 1024px. From 768px to 1023px the figure spans the section but three columns still leave
          ~195px of text each; from 1024px it also moves into the hero's narrower column, which cut
          that to ~134px and a five-line wrap. Stacked, the same copy reads in one or two lines. */}
      <div className="grid border-b xl:grid-cols-3">
        <BoundaryCell title="Operator" detail="Sees the permitted operational record for the active organization and property scope." />
        <BoundaryCell title="Resident" detail="Receives only the tenancy-facing projection for their own active relationship." quiet />
        <BoundaryCell title="Owner" detail="Receives the ownership-facing projection for invited interests and finalized records." />
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <div className="bg-[var(--brand-subtle)] px-6 py-5 sm:px-8"><p className="text-sm font-semibold">Server command</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Re-checks role, organization, property and object before the action runs.</p></div>
        <div className="bg-[var(--brand-subtle)] px-6 py-5 sm:px-8"><p className="text-sm font-semibold">Database policy</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Limits the rows the caller can reach even after application-level authorization.</p></div>
      </div>
      <figcaption className="border-t px-6 py-3 text-xs leading-5 text-muted-foreground sm:px-8">Representative Crecy control model. The three product surfaces intentionally receive different projections of the same property relationship.</figcaption>
    </figure>
  );
}

export function RelationshipProjectionProof() {
  return (
    <div
      role="region"
      aria-label="Record access by relationship, scrollable"
      tabIndex={0}
      className={`min-w-0 max-w-full overflow-x-auto border-y ${FOCUS_RING}`}
    >
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead className="border-b bg-card text-xs text-muted-foreground"><tr><th className="py-3 pr-5 font-medium">Record family</th><th className="px-5 py-3 font-medium">Operator</th><th className="px-5 py-3 font-medium">Resident</th><th className="py-3 pl-5 font-medium">Owner</th></tr></thead>
        <tbody className="divide-y">
          {relationshipRows.map(([record, operator, resident, owner]) => (
            <tr key={record}><th className="py-4 pr-5 font-semibold">{record}</th><td className="px-5 py-4 text-muted-foreground">{operator}</td><td className="px-5 py-4 text-muted-foreground">{resident}</td><td className="py-4 pl-5 text-muted-foreground">{owner}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LedgerCorrectionProof() {
  const entries = [
    ["Sep 01", "Resident rent", "+CA$1,850.00", "Posted"],
    ["Sep 04", "Repair expense", "−CA$420.00", "Posted"],
    ["Sep 05", "Repair reversal", "+CA$420.00", "Reversal"],
    ["Sep 05", "Corrected repair", "−CA$395.00", "Posted"],
  ] as const;
  return (
    <figure className="border-y bg-card">
      <div className="flex flex-col gap-5 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="text-xs text-muted-foreground">Maple Court · Operating book</p><p className="mt-1 text-xl font-semibold tracking-[-0.03em]">September ledger activity</p></div><div className="text-sm sm:text-right"><p className="text-muted-foreground">Currency</p><p className="mt-1 font-semibold">CAD</p></div></div>
      <div role="region" aria-label="September ledger activity, scrollable" tabIndex={0} className={`min-w-0 max-w-full overflow-x-auto ${FOCUS_RING}`}><table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium sm:px-7">Date</th><th className="px-5 py-3 font-medium">Entry</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 font-medium sm:pr-7">State</th></tr></thead><tbody className="divide-y">{entries.map(([date, entry, amount, state]) => <tr key={`${date}-${entry}`}><td className="px-5 py-4 text-muted-foreground sm:px-7">{date}</td><td className="px-5 py-4 font-medium">{entry}</td><td className="px-5 py-4 text-right font-mono tabular-nums">{amount}</td><td className="px-5 py-4 text-muted-foreground sm:pr-7">{state}</td></tr>)}</tbody></table></div>
      <div className="grid border-t sm:grid-cols-[1fr_auto] sm:items-center"><div className="px-5 py-5 sm:px-7"><p className="font-semibold">The original repair posting still exists.</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Correction is represented by a reversal and replacement rather than a quiet overwrite.</p></div><div className="border-t px-5 py-5 sm:border-l sm:border-t-0 sm:px-7 sm:text-right"><p className="text-xs text-muted-foreground">Demonstration net activity</p><p className="mt-1 text-2xl font-semibold tabular-nums">CA$1,455.00</p></div></div>
      <figcaption className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-7">Representative demonstration data; not a customer financial record.</figcaption>
    </figure>
  );
}

export function DocumentCustodyProof() {
  const events = [
    ["09:14:02", "Upload received", "Quarantined", "Unavailable to recipients"],
    ["09:14:03", "File identity verified", "Verified", "Expected hash recorded"],
    ["09:14:11", "Malware scan completed", "Clean", "Provider result recorded"],
    ["09:14:12", "Version released", "Eligible", "Exact version may be delivered"],
    ["09:16:27", "Owner delivery created", "Delivered", "Access-checked short-lived link"],
  ] as const;
  return (
    <figure className="border-y bg-card">
      <div className="grid border-b sm:grid-cols-[1.1fr_0.9fr]"><div className="p-5 sm:p-7"><p className="text-xs text-muted-foreground">Document record</p><p className="mt-1 text-lg font-semibold">Owner statement · September 2026</p></div><dl className="grid grid-cols-2 border-t sm:border-l sm:border-t-0"><div className="p-5"><dt className="text-xs text-muted-foreground">Version</dt><dd className="mt-1 font-semibold">v3</dd></div><div className="border-l p-5"><dt className="text-xs text-muted-foreground">Storage</dt><dd className="mt-1 font-semibold">Private</dd></div></dl></div>
      <ol className="divide-y">{events.map(([time, event, state, detail]) => <li key={`${time}-${event}`} className="grid gap-2 px-5 py-4 sm:grid-cols-[92px_1fr_110px_1.1fr] sm:items-baseline sm:px-7"><span className="font-mono text-xs text-muted-foreground">{time}</span><span className="font-semibold">{event}</span><span className="text-sm">{state}</span><span className="text-sm leading-6 text-muted-foreground">{detail}</span></li>)}</ol>
      <figcaption className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-7">Representative custody record. Versions supersede rather than overwrite prior released artifacts.</figcaption>
    </figure>
  );
}

export function PaymentBoundaryProof() {
  return (
    <figure className="border-y bg-card">
      <div className="grid divide-y md:grid-cols-[1fr_auto_1.1fr_auto_1fr] md:divide-x md:divide-y-0"><div className="p-5 sm:p-6"><p className="text-xs text-muted-foreground">Payer</p><p className="mt-2 font-semibold">Resident</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Confirms merchant, amount, currency, method and fee.</p></div><div className="hidden items-center justify-center px-3 text-muted-foreground md:flex">→</div><div className="p-5 sm:p-6"><p className="text-xs text-muted-foreground">Payment handling</p><p className="mt-2 font-semibold">Connected provider</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Handles card or bank credentials and returns provider references.</p></div><div className="hidden items-center justify-center px-3 text-muted-foreground md:flex">→</div><div className="p-5 sm:p-6"><p className="text-xs text-muted-foreground">Settlement destination</p><p className="mt-2 font-semibold">Operator account</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Crecy records verified payment state; it does not hold resident rent.</p></div></div>
      <figcaption className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">Provider webhooks are signature-verified and handled idempotently.</figcaption>
    </figure>
  );
}

export function SupportAccessRecord() {
  return (
    <figure className="border-y bg-card">
      <div className="grid sm:grid-cols-[1fr_auto] sm:items-start"><div className="p-5 sm:p-7"><p className="text-xs text-muted-foreground">Support session SUP-042</p><p className="mt-2 text-xl font-semibold tracking-[-0.03em]">Investigate document-delivery mismatch</p></div><div className="border-t px-5 py-5 sm:border-l sm:border-t-0 sm:px-7 sm:text-right"><p className="text-xs text-muted-foreground">Mode</p><p className="mt-1 font-semibold">Read-only</p></div></div>
      <dl className="grid border-t sm:grid-cols-3"><div className="p-5 sm:p-6"><dt className="text-xs text-muted-foreground">Scope</dt><dd className="mt-2 font-medium">Maple Court · document delivery</dd></div><div className="border-t p-5 sm:border-l sm:border-t-0 sm:p-6"><dt className="text-xs text-muted-foreground">Expires</dt><dd className="mt-2 font-medium">14:30 local time</dd></div><div className="border-t p-5 sm:border-l sm:border-t-0 sm:p-6"><dt className="text-xs text-muted-foreground">Audit evidence</dt><dd className="mt-2 font-medium">Session + each support read</dd></div></dl>
      <div className="border-t bg-muted/35 px-5 py-4 text-sm leading-6 text-muted-foreground sm:px-7">Opening a support session does not bypass tenant row policies and does not grant a write path into customer records.</div>
      <figcaption className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-7">Representative support-access record.</figcaption>
    </figure>
  );
}

export function AssuranceLedger() {
  return (
    <div role="region" aria-label="Assurance ledger, scrollable" tabIndex={0} className={`min-w-0 max-w-full overflow-x-auto border-y ${FOCUS_RING}`}><table className="w-full min-w-[700px] border-collapse text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-5 font-medium">Topic</th><th className="px-5 py-3 font-medium">Current evidence</th><th className="py-3 pl-5 font-medium">Public posture</th></tr></thead><tbody className="divide-y">{assuranceRows.map((row) => <tr key={row[0]}><td className="py-4 pr-5 font-semibold">{row[0]}</td><td className="px-5 py-4 text-muted-foreground">{row[1]}</td><td className="py-4 pl-5 font-medium">{row[2]}</td></tr>)}</tbody></table></div>
  );
}
