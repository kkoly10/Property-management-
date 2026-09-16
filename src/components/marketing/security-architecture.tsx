const accessRoles = [
  ["Operator", "Role permission + active organization + optional property scope"],
  ["Resident", "Active resident relationship + exact tenancy"],
  ["Owner", "Invited owner entity + exact property interest"],
] as const;

export function AccessBoundaryMap() {
  return (
    <figure>
      <figcaption className="mb-4 text-sm font-semibold">How one request reaches one permitted record</figcaption>
      <div className="border-y bg-card">
        <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
          {accessRoles.map(([role, scope], index) => (
            <div key={role} className="p-5 sm:p-6">
              <p className="font-mono text-xs text-primary">0{index + 1}</p>
              <h3 className="mt-4 text-lg font-semibold">{role}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{scope}</p>
            </div>
          ))}
        </div>
        <div className="border-t bg-[var(--brand-subtle)] px-5 py-5 text-center sm:px-8">
          <p className="text-xs font-medium text-muted-foreground">Shared decision boundary</p>
          <p className="mt-1 font-semibold">Relationship + organization + property + requested action</p>
        </div>
        <div className="grid divide-y border-t sm:grid-cols-[1fr_auto_1fr] sm:divide-x sm:divide-y-0">
          <div className="px-5 py-4 text-sm">
            <span className="font-semibold">Server command</span>
            <span className="ml-2 text-muted-foreground">re-checks the exact permission</span>
          </div>
          <div className="px-5 py-4 text-center font-mono text-xs text-primary">AND</div>
          <div className="px-5 py-4 text-sm">
            <span className="font-semibold">Database policy</span>
            <span className="ml-2 text-muted-foreground">limits the rows the caller can reach</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function ControlStack() {
  const rows = [
    ["Organization boundary", "Every tenant record belongs to an organization; cross-organization reads are rejected."],
    ["Active context", "An operator session is narrowed to one organization and cannot use context to widen access."],
    ["Property scope", "Staff may be limited to named properties across search, reports and domain workspaces."],
    ["Relationship scope", "Resident and owner portals receive deliberately smaller projections tied to their relationship."],
    ["Command authorization", "Writes run through server-side commands that check the permission and object again."],
    ["Audit evidence", "State-changing commands record actor, action, resource and correlation identifier."],
  ];

  return (
    <ol className="border-y">
      {rows.map(([title, detail], index) => (
        <li key={title} className="grid gap-3 border-b py-5 last:border-b-0 sm:grid-cols-[48px_190px_1fr] sm:items-baseline">
          <span className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</span>
          <span className="font-semibold">{title}</span>
          <span className="text-sm leading-6 text-muted-foreground">{detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function FinancialIntegrityRail() {
  return (
    <div className="border-y bg-card">
      <div className="grid divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {[
          ["01", "Command", "Authorized and idempotent"],
          ["02", "Journal", "Balanced posting in one book"],
          ["03", "Correction", "Reverse and replace; never overwrite"],
          ["04", "Projection", "Resident, operator and owner read the permitted view"],
        ].map(([number, title, detail]) => (
          <div key={number} className="p-5">
            <p className="font-mono text-xs text-[var(--finance-accent)]">{number}</p>
            <h3 className="mt-5 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentReleaseRail() {
  return (
    <ol className="grid border-y sm:grid-cols-5">
      {[
        ["01", "Quarantine", "New upload is not usable"],
        ["02", "Verify", "File identity and expected hash"],
        ["03", "Scan", "Provider result recorded"],
        ["04", "Release", "Clean files become eligible"],
        ["05", "Deliver", "Access-checked, short-lived link"],
      ].map(([number, title, detail], index) => (
        <li key={number} className={`p-5 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}>
          <p className="font-mono text-xs text-primary">{number}</p>
          <h3 className="mt-5 font-semibold">{title}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        </li>
      ))}
    </ol>
  );
}

export function AssuranceLedger() {
  const rows = [
    ["Tenant isolation", "Row policies, scoped commands and negative tests", "Built control"],
    ["Financial integrity", "Append-only postings, reversals and idempotency", "Built control"],
    ["Document handling", "Private storage, quarantine and scan lifecycle", "Built control"],
    ["SOC 2", "No independent report currently held", "Not claimed"],
    ["Published uptime", "No declared monitoring period yet", "Not claimed"],
    ["Penetration test", "No signed report and remediation record yet", "Not claimed"],
  ];

  return (
    <div className="overflow-x-auto border-y">
      <table className="w-full min-w-[700px] border-collapse text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="py-3 pr-5 font-medium">Topic</th>
            <th className="px-5 py-3 font-medium">Current evidence</th>
            <th className="py-3 pl-5 font-medium">Public posture</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row[0]}>
              <td className="py-4 pr-5 font-semibold">{row[0]}</td>
              <td className="px-5 py-4 text-muted-foreground">{row[1]}</td>
              <td className="py-4 pl-5 font-medium">{row[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
