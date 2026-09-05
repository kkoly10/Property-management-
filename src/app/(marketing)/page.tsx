import Link from "next/link";
import type { Metadata } from "next";
import {
  LivingHomeProof,
  MoneyRail,
  OperatorCommandCenterProof,
  OwnerOverviewProof,
  RelationshipIndex,
  TrustProof,
  WorkflowProof,
} from "@/components/marketing/product-proof";
import { Section, SectionHeading } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";
import {
  GROWTH_TRIAL_COPY,
  PLAN_LABELS,
  PLAN_ORDER,
  PRICE_BOOKS,
  formatPrice,
} from "@/lib/marketing/pricing";

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
      <Section className="!pb-14 !pt-14 sm:!pt-20 lg:!pb-24 lg:!pt-24">
        <div className="grid items-center gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:gap-16">
          <div className="max-w-xl">
            <h1 className="text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.055em] text-balance sm:text-[4rem] lg:text-[4.5rem]">
              Rental operations,
              <span className="block text-primary">made clear.</span>
            </h1>

            <p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground text-pretty">
              Crecy connects the operator, resident, and owner relationship around the same properties,
              payments, work, documents, and financial records.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/product">Explore Crecy OS</Link></Button>
            </div>

            <div className="mt-8 border-t pt-5 text-sm leading-6 text-muted-foreground">
              <p>{GROWTH_TRIAL_COPY}.</p>
              <p>Designed for the United States, Canada and Mexico.</p>
            </div>
          </div>

          <OperatorCommandCenterProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-16 lg:!py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-primary">One operating model</p>
          <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
            The same rental facts, seen from the relationship that needs them.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            The operator should not rebuild a resident balance or an owner statement in another tool.
            Crecy projects one operating record into three purpose-built surfaces.
          </p>
        </div>
        <RelationshipIndex />
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <LivingHomeProof className="mx-auto w-full max-w-md lg:mx-0" />

          <div className="max-w-xl">
            <p className="text-sm font-medium text-[#067647]">Crecy Living</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              A resident portal that feels like a home, not back-office software.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Balance and the next payment come first. Maintenance, messages, documents, and community
              notices sit one tap away. Each community can carry its own public-safe identity while the
              operating truth stays in Crecy.
            </p>
            <div className="mt-8 divide-y border-y text-sm">
              <div className="grid gap-2 py-4 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold">Payment clarity</span>
                <span className="text-muted-foreground">Current balance, upcoming charge, method, status, and receipts.</span>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold">Home requests</span>
                <span className="text-muted-foreground">Maintenance follows the same request the operator actually works.</span>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold">Relationship scope</span>
                <span className="text-muted-foreground">Residents see their tenancy, not someone else&rsquo;s property data.</span>
              </div>
            </div>
            <p className="mt-7">
              <Link href="/crecy-living" className="text-sm font-semibold text-primary hover:underline">
                See Crecy Living →
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-primary">Crecy Owner</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              Owner visibility built from finalized records, not a second spreadsheet.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Statements, recorded remittances, and approvals come from the same property and ledger
              history the operator already uses. Each property and currency stays explicit rather than
              disappearing inside a fabricated portfolio total.
            </p>
            <p className="mt-7 text-sm leading-6 text-muted-foreground">
              Owner access follows the ownership relationship. Resident-level details remain outside the
              owner projection.
            </p>
          </div>

          <OwnerOverviewProof />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="max-w-3xl">
          <SectionHeading
            title="A maintenance request should not become four separate stories."
            lede="Crecy keeps the resident request, operator workflow, completion evidence, recorded cost, and owner-facing financial result connected as the work moves."
          />
        </div>
        <WorkflowProof />
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="max-w-lg">
            <p className="text-sm font-medium text-primary">Money</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[2.75rem]">
              The money trail stays one trail.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Charges, payments, allocations, refunds, corrections, settlement reconciliation, and owner
              statements belong to the same accounting history.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Posted financial history is append-only. Corrections reverse and replace rather than silently
              rewriting what happened.
            </p>
          </div>
          <div>
            <MoneyRail />
          </div>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="max-w-lg">
            <p className="text-sm font-medium text-primary">Trust architecture</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[2.75rem]">
              Security should be visible in how the product behaves.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Crecy uses tenant isolation, relationship-scoped portals, private document delivery, and
              audit history instead of turning security into a row of unsupported badges.
            </p>
            <p className="mt-7">
              <Link href="/security" className="text-sm font-semibold text-primary hover:underline">
                Read the security architecture →
              </Link>
            </p>
          </div>
          <TrustProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-24">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[2.5rem]">
              Start with the portfolio you have.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Local price books are published in USD, CAD, and MXN. The table below uses the United States
              price book; pricing is not converted at checkout.
            </p>
          </div>

          <div className="overflow-x-auto border-y">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead className="border-b text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 pr-5">Plan</th>
                  <th className="px-5 py-3">Monthly</th>
                  <th className="px-5 py-3">Included active units</th>
                  <th className="py-3 pl-5"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PLAN_ORDER.map((plan) => (
                  <tr key={plan}>
                    <td className="py-4 pr-5 font-semibold">{PLAN_LABELS[plan]}</td>
                    <td data-financial-value className="px-5 py-4 text-lg font-semibold">
                      {formatPrice(usd, usd.plans[plan].monthlyMinor)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {usd.plans[plan].includedUnits} active unit{usd.plans[plan].includedUnits === 1 ? "" : "s"}
                    </td>
                    <td className="py-4 pl-5 text-right">
                      <Link href="/pricing" className="text-sm font-semibold text-primary hover:underline">Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              Bring the real portfolio in. Keep the relationships connected.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              {GROWTH_TRIAL_COPY}. Import the buildings, residents, active tenancies, and balances you
              already operate.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pilot">Join the pilot</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
