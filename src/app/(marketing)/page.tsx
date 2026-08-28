import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow, FeatureGrid, FeatureItem, ProductComposition, Section, SectionHeading } from "@/components/marketing/sections";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { GROWTH_TRIAL_COPY, PLAN_ORDER, PLAN_LABELS, PRICE_BOOKS, formatPrice } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Rental operations, finally connected",
  description:
    "Crecy connects properties, residents, rent, maintenance, documents and owner visibility in one clear system. Designed for the United States, Canada and Mexico.",
  path: "/",
});

const usd = PRICE_BOOKS.US;

export default function HomePage() {
  return (
    <>
      {/* 1 — Hero + a real product composition. */}
      <Section className="!pb-12 lg:!pb-16">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>Crecy</Eyebrow>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">
              Rental operations, finally connected.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground text-pretty">
              Properties, residents, rent, maintenance, documents and owner visibility stop living in
              separate tools. Crecy holds them in one system, so a payment, a work order and an owner
              statement are the same set of facts seen from three sides.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/product">See the platform</Link></Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              {GROWTH_TRIAL_COPY}. Designed for the United States, Canada and Mexico.
            </p>
          </div>

          <ProductComposition label="Crecy OS · Operator dashboard">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Collected", value: "$184,500" },
                { label: "Outstanding", value: "$12,750" },
                { label: "Open work", value: "7" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums">{metric.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {[
                { unit: "Maple Court · 101", detail: "Rent posted · due Sep 1", state: "Open" },
                { unit: "Maple Court · 204", detail: "Payment received · check", state: "Allocated" },
                { unit: "Harbour Row · 3B", detail: "Kitchen sink leak", state: "Assigned" },
              ].map((row) => (
                <div key={row.unit} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.unit}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{row.state}</span>
                </div>
              ))}
            </div>
          </ProductComposition>
        </div>
      </Section>

      {/* 2 — The three surfaces and how they relate. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="One system, three vantage points"
          title="Crecy OS, Crecy Living and Crecy Owner see the same facts."
          lede="Not three products stitched together. One ledger, one document store, one maintenance history — projected to whoever is looking, with access decided by their relationship to the property."
        />
        <FeatureGrid>
          <FeatureItem title="Crecy OS — the operator">
            Portfolio, leasing, rent, payments, reconciliation, maintenance, documents and owner
            reporting. Everything an operator records lands in one organization&rsquo;s books.
          </FeatureItem>
          <FeatureItem title="Crecy Living — the resident">
            A mobile-first portal for balance, payments, receipts, maintenance requests, documents and
            messages. A resident sees their own tenancy and nothing else.
          </FeatureItem>
          <FeatureItem title="Crecy Owner — the owner">
            Statements, remittances and approvals for the properties an owner actually holds an interest
            in, drawn from the same postings the operator made.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      {/* 3 — Rent and accounting. */}
      <Section>
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Rent and accounting"
              title="Rent that posts itself, on the date the property actually keeps."
              lede="Recurring charges generate against each property's own time zone, so a Los Angeles building is never charged on a date that has not happened there. Every charge, payment and correction posts to a balanced double-entry ledger."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Posted financial records are append-only. Corrections are reversing entries, never edits.</li>
              <li>Manual payments — cash, check, transfer — are recorded and allocated with the same rigour as card payments.</li>
              <li>Write-offs, refunds, disputes and settlement reconciliation all land in the same books.</li>
            </ul>
          </div>
          <ProductComposition label="Crecy OS · Journal">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 text-right font-medium">Debit</th>
                  <th className="pb-2 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                <tr className="border-b"><td className="py-2.5">1100 Accounts receivable</td><td className="py-2.5 text-right">1,850.00</td><td className="py-2.5 text-right text-muted-foreground">—</td></tr>
                <tr className="border-b"><td className="py-2.5">4000 Rental income</td><td className="py-2.5 text-right text-muted-foreground">—</td><td className="py-2.5 text-right">1,850.00</td></tr>
                <tr><td className="py-2.5 font-sans text-xs text-muted-foreground">Balanced</td><td className="py-2.5 text-right">1,850.00</td><td className="py-2.5 text-right">1,850.00</td></tr>
              </tbody>
            </table>
          </ProductComposition>
        </div>
      </Section>

      {/* 4 — Maintenance. */}
      <Section tone="surface">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <ProductComposition label="Crecy OS · Work order" className="order-last lg:order-first">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Kitchen sink leaking under cabinet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Harbour Row · Unit 3B · MR-4F21A8</p>
                </div>
                <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">In progress</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-muted-foreground">Resident urgency</p>
                  <p className="mt-1 font-medium">Urgent</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-muted-foreground">Official priority</p>
                  <p className="mt-1 font-medium">Standard</p>
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3 text-xs">
                <p className="text-muted-foreground">Recorded cost</p>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums">$320.00 → 6200 Repairs and maintenance</p>
              </div>
            </div>
          </ProductComposition>
          <div>
            <SectionHeading
              eyebrow="Maintenance"
              title="From a resident's photo to a posted expense, without re-keying."
              lede="A resident reports an issue in Crecy Living. The operator triages it, assigns a vendor and records the cost — and that cost posts to the property's books and flows onto the owner's statement on its own."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Requested urgency and official priority are kept separate, so triage is a decision rather than an argument.</li>
              <li>Photo evidence stays private to the request; vendors see the assignment, not the portfolio.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 5 — Documents and leasing. */}
      <Section>
        <SectionHeading
          eyebrow="Documents and leasing"
          title="Leases and notices that stay where they belong."
          lede="Upload an existing signed lease and activate the tenancy against it. Deliver a notice to a resident or owner and keep the acknowledgement. Documents live in private storage, scoped to the property and the relationship."
        />
        <FeatureGrid>
          <FeatureItem title="Existing leases, not just new ones">
            Activate a tenancy from a lease you already signed, with the document attached — Crecy does
            not require you to re-paper your portfolio to start using it.
          </FeatureItem>
          <FeatureItem title="Delivery with a record">
            Portal, email or an expiring secure link. Acknowledgements are append-only, so what was
            delivered and when is not a matter of memory.
          </FeatureItem>
          <FeatureItem title="Operator-controlled">
            Operators upload and control their own leases, policies and legal documents. Crecy stores and
            routes them; it does not verify their legal sufficiency.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      {/* 6 — Owner visibility. */}
      <Section tone="surface">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Owner visibility"
              title="Owners see the property, not a spreadsheet you rebuilt for them."
              lede="Statements are generated from the same postings the operator made, for exactly the properties an owner holds an interest in. Where approvals are configured, an owner decides in the product and the decision is recorded."
            />
          </div>
          <ProductComposition label="Crecy Owner · Statement">
            <div className="space-y-2.5 text-sm">
              {[
                ["Rental income", "6,200.00"],
                ["Repairs and maintenance", "(320.00)"],
                ["Management fee", "(496.00)"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b pb-2.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono tabular-nums">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold">Net to owner</span>
                <span className="font-mono text-base font-semibold tabular-nums">5,384.00</span>
              </div>
            </div>
          </ProductComposition>
        </div>
      </Section>

      {/* 7 — Migration. */}
      <Section>
        <SectionHeading
          eyebrow="Getting your portfolio in"
          title="Start with the portfolio you already have."
          lede="Crecy imports occupied buildings, not just empty ones. A single row can create the property and unit and activate the lease on it, so an operator's first day is their real portfolio rather than a demo."
        />
        <FeatureGrid>
          <FeatureItem title="CSV or Excel">
            Import from .csv or a true .xlsx workbook, mapped column by column with a validation pass
            before anything commits.
          </FeatureItem>
          <FeatureItem title="Occupied, with balances">
            Bring residents, active tenancies and outstanding balances. Opening balances post as a
            balanced journal entry, not a number typed into a field.
          </FeatureItem>
          <FeatureItem title="Validate, then commit">
            Every import validates first and reports what it would create, change and skip. Nothing is
            written until you accept that summary.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      {/* 8 — North America, in evidence-safe wording. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="North America"
          title="Designed for the United States, Canada and Mexico."
          lede="Country profiles, localized price books in USD, CAD and MXN, and English, Spanish and French locales are built into the data model rather than bolted on."
        />
        <p className="mt-8 max-w-2xl text-sm leading-6 text-muted-foreground">
          North American availability is being prepared. Each country opens only once its payment,
          support, privacy, tax and localization gates have passed — so a country badge in Crecy means
          the operational work is done, not that the currency exists in a dropdown.
        </p>
      </Section>

      {/* 9 — Pricing preview. */}
      <Section>
        <SectionHeading
          eyebrow="Pricing"
          title="Priced per active unit, in your own currency."
          lede="Localized price books rather than a converted figure. Crecy subscription billing is separate from rent collection, and Crecy charges no transaction fee on resident rent."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((plan) => (
            <div key={plan} className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold">{PLAN_LABELS[plan]}</p>
              <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">
                {formatPrice(usd, usd.plans[plan].monthlyMinor)}
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {usd.plans[plan].includedUnits} active unit{usd.plans[plan].includedUnits === 1 ? "" : "s"} included
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Shown in {usd.currency}. Canadian and Mexican price books, annual pricing and the full feature
          comparison are on the <Link href="/pricing" className="font-medium text-foreground underline underline-offset-4">pricing page</Link>.
        </p>
      </Section>

      {/* 10 — Trust and security architecture. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Trust"
          title="Built with tenant isolation, scoped access and audit history."
          lede="Security here is an architecture, not a badge. Every tenant table carries its organization, every write goes through a command that authorizes first, and privileged actions are recorded."
        />
        <FeatureGrid>
          <FeatureItem title="Tenant isolation">
            Row-level security on every tenant table, with reads scoped to an organization the caller
            actually belongs to.
          </FeatureItem>
          <FeatureItem title="Role and property scope">
            Staff hold roles, and roles can be narrowed to specific properties. A coordinator for one
            building does not see the portfolio.
          </FeatureItem>
          <FeatureItem title="Recorded, not remembered">
            State changes write an audit event. Financial history is append-only by construction.
          </FeatureItem>
        </FeatureGrid>
        <p className="mt-10">
          <Link href="/security" className="text-sm font-medium underline underline-offset-4">
            How Crecy is built →
          </Link>
        </p>
      </Section>

      {/* 11 — Final CTA. */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Bring your portfolio in and see it connected.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
            {GROWTH_TRIAL_COPY}. Import the buildings you already manage, with their residents and
            balances.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pilot">Join the pilot</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
