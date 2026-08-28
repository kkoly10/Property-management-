import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { FeatureGrid, FeatureItem, ProductComposition, Section, SectionHeading } from "@/components/marketing/sections";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { GROWTH_TRIAL_COPY } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Product — how Crecy runs a rental portfolio",
  description:
    "Portfolio and residents, leasing and import, rent and accounting, payments and reconciliation, maintenance, documents, communications and owner visibility — as one connected workflow.",
  path: "/product",
});

/**
 * The workflow tour.
 *
 * Ordered the way an operator actually meets the system — you bring a portfolio in before you can
 * charge rent on it, and you charge rent before you reconcile it — rather than as a feature list.
 * Every claim here names the mechanism that backs it, because file 18 §1 prohibits outcome claims we
 * have no study for.
 */
export default function ProductPage() {
  return (
    <>
      <Section className="!pb-10 lg:!pb-14">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-balance sm:text-5xl">
            One workflow, from the first unit to the owner&rsquo;s statement.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground text-pretty">
            Crecy is built around the sequence an operator lives in: get the portfolio in, get leases
            active, charge and collect rent, keep the building working, keep the paperwork findable, and
            show owners what happened. Each step writes to the same records the next step reads.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pricing">See pricing</Link></Button>
          </div>
        </div>
      </Section>

      {/* Portfolio and residents */}
      <Section className="!border-t">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Portfolio and residents"
              title="Properties, units, tenancies and the people in them."
              lede="A property carries its own country, currency, time zone and accounting book. A unit belongs to it. A tenancy joins a household to that unit for a period of time — and it is the tenancy, not a spreadsheet row, that everything else hangs from."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Households can hold more than one resident, each with their own portal access.</li>
              <li>Staff access is granted by role and, where you want it, narrowed to specific properties.</li>
              <li>Archiving a property never deletes its financial history.</li>
            </ul>
          </div>
          <ProductComposition label="Crecy OS · Property">
            <div className="space-y-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-sm font-medium">Maple Court</p>
                <p className="mt-1 text-xs text-muted-foreground">Toronto, ON · CAD · America/Toronto · 24 units</p>
              </div>
              {[
                { unit: "101", resident: "Household of 2", state: "Occupied" },
                { unit: "204", resident: "Household of 1", state: "Occupied" },
                { unit: "310", resident: "—", state: "Vacant" },
              ].map((row) => (
                <div key={row.unit} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Unit {row.unit}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.resident}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{row.state}</span>
                </div>
              ))}
            </div>
          </ProductComposition>
        </div>
      </Section>

      {/* Leasing and import */}
      <Section className="!border-t">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <ProductComposition label="Crecy OS · Import" className="lg:order-2">
            <div className="space-y-2 text-sm">
              {[
                { file: "portfolio.xlsx", rows: "24 rows", state: "Validated" },
                { file: "leases.csv", rows: "22 rows", state: "Committed" },
                { file: "opening-balances.csv", rows: "6 rows", state: "Committed" },
              ].map((row) => (
                <div key={row.file} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.file}</p>
                    <p className="text-xs text-muted-foreground">{row.rows}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{row.state}</span>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                Every import is validated before anything is written, and reports per row rather than
                failing the whole file.
              </p>
            </div>
          </ProductComposition>
          <div className="lg:order-1">
            <SectionHeading
              title="Arrive with an occupied portfolio, not an empty one."
              lede="Most operators are not starting from zero. Crecy imports properties, units, active leases, additional household members and opening receivable balances from CSV or Excel — and validates the whole file before it writes anything."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>A single combined row can create the property, the unit and the active lease together.</li>
              <li>Opening balances post as a balanced ledger entry, so day one already reconciles.</li>
              <li>Re-running an import reports what already exists instead of duplicating it.</li>
              <li>Existing lease PDFs upload in bulk with a manifest and land in the same document store.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Rent and accounting */}
      <Section tone="surface" className="!border-t">
        <SectionHeading
          title="A real double-entry ledger under every number you see."
          lede="Crecy does not keep a balance field and hope it stays right. Charges, payments, write-offs, reversals, fees and owner remittances all post as balanced journal transactions, and the balances are read back out of them."
        />
        <FeatureGrid>
          <FeatureItem title="Recurring charges by property time zone">
            Rent generates on the operational date of the property it belongs to, so a building in Los
            Angeles is never charged on a date that has not happened there yet.
          </FeatureItem>
          <FeatureItem title="Append-only financial history">
            Posted entries cannot be edited or deleted. A mistake is corrected by a reversing entry,
            which leaves both the error and the correction visible.
          </FeatureItem>
          <FeatureItem title="Money in minor units">
            Every amount is stored as an integer in its own currency and converted only for display.
            No floating-point rounding drifts into a resident&rsquo;s balance.
          </FeatureItem>
          <FeatureItem title="Per-book chart of accounts">
            Accounts are scoped to an accounting book, so multiple entities inside one organization keep
            genuinely separate books.
          </FeatureItem>
          <FeatureItem title="Write-offs and bad debt">
            Uncollectible balances are written off to a bad-debt account rather than quietly deleted from
            the receivable.
          </FeatureItem>
          <FeatureItem title="Statements and exports">
            Owner statements and CSV exports are generated from the postings themselves, not re-keyed.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      {/* Payments and reconciliation */}
      <Section className="!border-t">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              title="Card, bank and the cheque that arrived in the office."
              lede="Online payments are processed through eligible operators' connected payment accounts. Cash, cheque and transfer are recorded manually with the same allocation rules — so the ledger does not care how the money arrived."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Processing charges are the operator&rsquo;s responsibility under connected-account terms, and post to their own expense account.</li>
              <li>Refunds, reversals and disputes post as their own transactions against the original.</li>
              <li>A reconciliation workspace matches settlement against what was recorded.</li>
              <li>Crecy does not hold resident rent in the direct-charge model.</li>
            </ul>
          </div>
          <ProductComposition label="Crecy OS · Payment allocation">
            <div className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between rounded-lg border bg-background px-3 py-2.5">
                <span className="text-muted-foreground">Payment received</span>
                <span className="font-mono font-semibold tabular-nums">$1,450.00</span>
              </div>
              {[
                { label: "August rent", amount: "$1,400.00" },
                { label: "Late fee", amount: "$50.00" },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between rounded-lg border bg-background px-3 py-2.5">
                  <span>{row.label}</span>
                  <span className="font-mono tabular-nums">{row.amount}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between px-3 pt-2 text-xs text-muted-foreground">
                <span>Remaining balance</span>
                <span className="font-mono tabular-nums">$0.00</span>
              </div>
            </div>
          </ProductComposition>
        </div>
      </Section>

      {/* Maintenance */}
      <Section className="!border-t">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <ProductComposition label="Crecy OS · Work order" className="lg:order-2">
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-background p-3">
                <p className="font-medium">Kitchen sink leak · Harbour Row 3B</p>
                <p className="mt-1 text-xs text-muted-foreground">Reported by resident · Priority: urgent</p>
              </div>
              <ol className="space-y-2">
                {[
                  { step: "Submitted", detail: "Resident described the issue and attached a photo" },
                  { step: "Assigned", detail: "Vendor scheduled" },
                  { step: "Completed", detail: "Cost recorded — posts to repairs and maintenance" },
                ].map((row) => (
                  <li key={row.step} className="flex gap-3 rounded-lg border bg-background px-3 py-2.5">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium">{row.step}</span>
                      <span className="block text-xs text-muted-foreground">{row.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </ProductComposition>
          <div className="lg:order-1">
            <SectionHeading
              title="A request from a resident becomes a cost in the books."
              lede="Residents report from their phone. Staff triage, assign and track. When the work is done and a cost is recorded, it posts to the property's expense account — which means it appears on the owner's statement without anyone re-entering it."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>The resident sees status changes on the same request they filed.</li>
              <li>Photos and invoices attach to the work order and stay with its history.</li>
              <li>Recorded costs carry the property, so they flow to the right owner.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Documents */}
      <Section className="!border-t">
        <SectionHeading
          title="Leases, notices and receipts where the people who need them can find them."
          lede="Documents are stored privately and reached through short-lived, access-checked links — never a public URL. Operators upload and control their own leases, policies and legal documents."
        />
        <FeatureGrid>
          <FeatureItem title="Uploads are scanned before release">
            An uploaded file is quarantined, scanned, and only then made available. A file that fails is
            rejected rather than silently shared.
          </FeatureItem>
          <FeatureItem title="Versions, not overwrites">
            A new version supersedes the old one without destroying it, so what a resident actually
            received stays recoverable.
          </FeatureItem>
          <FeatureItem title="Delivery with acknowledgement">
            Send a document to a resident or owner by email or secure link and record that they opened
            and acknowledged it.
          </FeatureItem>
          <FeatureItem title="Scoped by relationship">
            A resident sees their own tenancy&rsquo;s documents. An owner sees their own properties&rsquo;.
            Neither can reach the other&rsquo;s.
          </FeatureItem>
          <FeatureItem title="Operator-supplied, operator-owned">
            Crecy stores and delivers your documents. It does not supply or verify the legal sufficiency
            of their wording.
          </FeatureItem>
          <FeatureItem title="Bulk migration">
            Bring an existing archive in with a manifest; each file still goes through the same scan gate.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      {/* Communications */}
      <Section tone="surface" className="!border-t">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Communications"
              title="Conversations attached to the relationship, not to someone's inbox."
              lede="Every active resident and owner relationship gets a conversation with the operator. Announcements go to a property or the whole portfolio. Because the thread belongs to the relationship, staff turnover does not lose the history."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Notifications respect the recipient&rsquo;s preferences — except access and security mail, which can never be silenced.</li>
              <li>Announcements are recorded with who sent them and when.</li>
              <li>Message history stays with the tenancy for as long as the record is kept.</li>
            </ul>
          </div>
          <ProductComposition label="Crecy OS · Announcement">
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-background p-3">
                <p className="font-medium">Water shut-off — Tuesday 9am to 1pm</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  Building maintenance will replace the riser valve. Please store water for the morning.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-xs">
                <span className="text-muted-foreground">Audience</span>
                <span className="font-medium">Maple Court · 24 units</span>
              </div>
            </div>
          </ProductComposition>
        </div>
      </Section>

      {/* Owner visibility */}
      <Section className="!border-t">
        <SectionHeading
          title="Owners read the operator's books, not a summary of them."
          lede="An owner statement is assembled from the journal entries tagged to their properties over the period. Revenue, expenses, management fees and remittances are the same rows the operator posted — which is why the owner's questions have answers."
        />
        <FeatureGrid columns={2}>
          <FeatureItem title="Interest-scoped access">
            An owner entity sees the properties it holds an interest in. Ownership can be split across
            multiple interests without splitting the books.
          </FeatureItem>
          <FeatureItem title="Statements and remittances">
            Period statements with the underlying detail, plus the remittance record of what was actually
            paid out.
          </FeatureItem>
          <FeatureItem title="Approvals">
            Where an operator wants owner sign-off above a threshold, the approval is requested and
            recorded rather than agreed by email.
          </FeatureItem>
          <FeatureItem title="Print and export">
            Statements print cleanly and export as CSV for the owner&rsquo;s own accountant.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      <Section tone="surface">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Start with one property. Bring the rest when you are ready.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">{GROWTH_TRIAL_COPY}.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pilot">Join the pilot</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
