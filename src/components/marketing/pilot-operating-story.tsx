const activationStages = [
  ["Organization", "Country, currency, time zone and accepted terms"],
  ["Portfolio", "Properties, units, accounting books and opening balances"],
  ["Relationships", "Team, residents, tenancies and owner interests"],
  ["Ready to operate", "Rent schedules, maintenance, documents and reporting"],
] as const;

const importRows = [
  ["properties.csv", "3 properties", "Ready", "Country, currency and time zone recognized"],
  ["units.csv", "50 units", "Ready", "All unit identifiers mapped"],
  ["leases.xlsx", "41 tenancies", "Review", "2 household relationships need confirmation"],
  ["opening-balances.csv", "41 balances", "Review", "3 rows need operator classification"],
  ["lease-documents.zip", "38 files", "Staged", "Manifest matched; documents enter scan lifecycle"],
] as const;

const readinessRows = [
  ["Portfolio structure", "Ready", "3 properties · 50 active units"],
  ["Resident relationships", "Review", "39 ready · 2 need confirmation"],
  ["Opening balances", "Review", "38 ready · 3 need classification"],
  ["Payment collection", "Configure", "Connected account required for online payments"],
  ["Transactional email", "Configure", "Operator mail relay required"],
] as const;

export function PilotReadinessBoard() {
  return (
    <figure className="border-y bg-card">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-xs text-muted-foreground">Pilot workspace · representative data</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Maple Property Group</h2>
        </div>
        <p className="text-sm font-medium">50 units · 3 properties</p>
      </div>

      <div className="grid md:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b p-5 md:border-b-0 md:border-r sm:p-6">
          <p className="text-sm font-semibold">Activation readiness</p>
          <p className="mt-3 text-[2.4rem] font-normal leading-none tracking-[-0.05em]">72%</p>
          <div className="mt-5 h-1.5 bg-muted"><div className="h-full w-[72%] bg-primary" /></div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            The portfolio is usable now. Four items remain open before every configured workflow can run.
          </p>
        </div>

        <dl className="divide-y px-5 sm:px-6">
          {readinessRows.map(([term, state, detail]) => (
            <div key={term} className="grid gap-2 py-3.5 sm:grid-cols-[1fr_auto] sm:items-baseline">
              <div>
                <dt className="text-sm font-medium">{term}</dt>
                <dd className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</dd>
              </div>
              <dd className="text-xs font-semibold text-foreground">{state}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figcaption className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">
        Representative pilot workspace. Sample portfolio data is used to demonstrate the activation model.
      </figcaption>
    </figure>
  );
}

export function PilotActivationFlow() {
  return (
    <div className="border-y">
      {activationStages.map(([title, detail], index) => (
        <div key={title} className="grid gap-4 border-b py-6 last:border-b-0 md:grid-cols-[180px_1fr_auto] md:items-center">
          <p className="text-lg font-semibold tracking-[-0.025em]">{title}</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p>
          <span className="w-fit border-l-2 border-primary pl-3 text-xs font-medium text-muted-foreground">
            {index === activationStages.length - 1 ? "Operating" : "Established"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ImportReadinessProof() {
  return (
    <figure className="min-w-0 max-w-full border-y bg-card">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-xs text-muted-foreground">Validated import · sample portfolio</p>
          <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em]">What Crecy accepts—and what still needs you</h3>
        </div>
        <p className="text-xs text-muted-foreground">No silent write on exception</p>
      </div>
      <div
        role="region"
        aria-label="Validated import result, scrollable"
        tabIndex={0}
        className="min-w-0 max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium sm:px-6">Source</th>
              <th className="px-5 py-3 font-medium">Recognized</th>
              <th className="px-5 py-3 font-medium">State</th>
              <th className="px-5 py-3 font-medium sm:px-6">Operator note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {importRows.map(([source, recognized, state, note]) => (
              <tr key={source}>
                <td className="px-5 py-4 font-medium sm:px-6">{source}</td>
                <td className="px-5 py-4 tabular-nums text-muted-foreground">{recognized}</td>
                <td className="px-5 py-4 font-medium">{state}</td>
                <td className="px-5 py-4 text-muted-foreground sm:px-6">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">
        Representative import result. Real imports are validated before write and keep unresolved rows visible for operator review.
      </figcaption>
    </figure>
  );
}

export function PilotStatusRegister() {
  const groups = [
    { title: "Working now", items: ["Onboarding, portfolio, residents and lease activation", "Recurring rent, manual payments, write-offs and reversals", "Maintenance through recorded cost", "Documents, acknowledgements, messaging and owner statements"] },
    { title: "Requires configuration", items: ["Online card and bank payments require a verified connected payment account", "Transactional email requires an operator-configured mail relay"] },
    { title: "Not included in the pilot", items: ["Automated owner payouts", "Tenant screening and inspections", "Public API and custom domains"] },
    { title: "What we ask of you", items: ["Use Crecy against something real", "Tell us when an import, workflow or record is wrong", "Do not treat the pilot as a substitute for your own legal or accounting review"] },
  ] as const;

  return (
    <div className="border-y">
      {groups.map((group) => (
        <section key={group.title} className="grid gap-5 border-b py-7 last:border-b-0 lg:grid-cols-[220px_1fr]">
          <h3 className="text-lg font-semibold tracking-[-0.025em]">{group.title}</h3>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {group.items.map((item) => (
              <li key={item} className="min-w-0 border-t py-3 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere] first:border-t-0 sm:first:border-t">{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
