import Link from "next/link";
import type { Metadata } from "next";
import { OperatorCommandCenterProof } from "@/components/marketing/product-proof";
import {
  FinanceDeskProof,
  MaintenanceDeskProof,
  OperatingSequence,
  PortfolioRegisterProof,
  RecordContinuityProof,
} from "@/components/marketing/operating-story";
import { Section, SectionHeading } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { GROWTH_TRIAL_COPY } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Product — how Crecy runs a rental portfolio",
  description:
    "See how Crecy connects portfolio setup, residents, rent, maintenance, documents, communications and owner reporting in one operating sequence.",
  path: "/product",
});

export default function ProductPage() {
  return (
    <>
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-24 lg:!pt-24">
        <div className="grid items-center gap-12 xl:grid-cols-[0.78fr_1.22fr] xl:gap-16">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-primary">The operating system</p>
            <h1 className="mt-4 text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] text-balance sm:text-[4rem]">
              Run the portfolio as one connected record.
            </h1>
            <p className="mt-7 text-lg leading-8 text-muted-foreground text-pretty">
              A property begins as structure, becomes a set of resident relationships, produces financial
              activity and building work, and ends each period in an owner record. Crecy keeps that chain
              visible instead of scattering it across unrelated tools.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/pilot">Join the pilot</Link></Button>
            </div>
          </div>

          <OperatorCommandCenterProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-16 lg:!py-20">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.6rem]">
              The sequence matters.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Crecy is organized around what an operator must establish, decide, reconcile and preserve—not
              around a menu of disconnected features.
            </p>
          </div>
          <OperatingSequence />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr] lg:gap-16">
          <div className="max-w-md lg:pt-9">
            <p className="text-sm font-medium text-primary">Establish</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.6rem]">
              Start with the portfolio that already exists.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Properties carry their country, currency, time zone and accounting book. Units, households,
              active tenancies and existing leases join that structure through guided setup or validated
              CSV and Excel imports.
            </p>
            <dl className="mt-8 divide-y border-y text-sm">
              <div className="grid gap-1 py-4 sm:grid-cols-[120px_1fr]">
                <dt className="font-semibold">Before write</dt>
                <dd className="text-muted-foreground">Every import is validated row by row.</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[120px_1fr]">
                <dt className="font-semibold">After write</dt>
                <dd className="text-muted-foreground">Re-running reports existing records instead of duplicating them.</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[120px_1fr]">
                <dt className="font-semibold">Access</dt>
                <dd className="text-muted-foreground">Staff roles can narrow further to exact properties.</dd>
              </div>
            </dl>
          </div>
          <PortfolioRegisterProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid items-start gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16">
          <FinanceDeskProof />
          <div className="max-w-md lg:pt-9">
            <p className="text-sm font-medium text-primary">Operate the money</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.6rem]">
              Every visible balance has an accounting history.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Recurring charges, connected-account payments, cash or cheque records, allocations,
              reversals, fees and remittances post through the same double-entry ledger.
            </p>
            <ul className="mt-8 divide-y border-y text-sm leading-6">
              <li className="py-4">Posted history is corrected by reversal, never silent editing.</li>
              <li className="py-4">Each accounting book keeps one immutable functional currency after posting begins.</li>
              <li className="py-4">Settlement exceptions stay visible until an operator resolves them.</li>
              <li className="py-4">Crecy does not hold resident rent in the direct-charge model.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="max-w-3xl">
          <SectionHeading
            title="A resident request becomes controlled work—not another inbox message."
            lede="The original report, operator priority, assignment, completion evidence, cost and any owner decision remain parts of one maintenance record. Residents receive the status they are allowed to see; internal notes and financial detail stay with the operator."
          />
        </div>
        <div className="mt-12">
          <MaintenanceDeskProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">Keep the record</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.6rem]">
              Documents, conversations and owner reporting keep their source.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Crecy does not turn the same event into competing versions. A delivered lease retains its
              exact version. A completed repair retains its evidence and cost. A finalized statement reads
              from the property-tagged postings already in the books.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Operators upload and control their own leases, policies and legal documents. Crecy stores,
              scans, versions and delivers them; it does not verify their legal sufficiency.
            </p>
          </div>
          <RecordContinuityProof />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              Start with one property. Keep the operating model when the portfolio grows.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">{GROWTH_TRIAL_COPY}.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pricing">See pricing</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
