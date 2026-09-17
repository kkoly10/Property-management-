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
import { Section } from "@/components/marketing/sections";
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
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-28 lg:!pt-24">
        <div className="grid items-center gap-14 xl:grid-cols-[0.82fr_1.18fr] xl:gap-20">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(3.4rem,6.8vw,6.6rem)] font-normal leading-[0.9] tracking-[-0.072em] text-balance">
              Run the portfolio as one connected record.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground text-pretty sm:text-xl sm:leading-9">
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

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <h2 className="max-w-4xl text-[clamp(3rem,5.4vw,5.3rem)] font-normal leading-[0.94] tracking-[-0.062em] text-balance">
            The sequence matters because every later record depends on what came before it.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-muted-foreground lg:pb-2">
            Crecy is organized around what an operator must establish, decide, reconcile and preserve—not
            around a menu of disconnected features.
          </p>
        </div>
        <div className="mt-12"><OperatingSequence /></div>
      </Section>

      <Section className="!py-20 lg:!py-32">
        <div className="grid gap-10 lg:grid-cols-[0.62fr_1.38fr] lg:gap-20">
          <div className="max-w-xl lg:pt-6">
            <h2 className="text-[clamp(2.9rem,4.8vw,4.8rem)] font-normal leading-[0.96] tracking-[-0.06em] text-balance">
              Start with the portfolio that already exists.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground">
              Properties carry their country, currency, time zone and accounting book. Units, households,
              active tenancies and existing leases join that structure through guided setup or validated
              CSV and Excel imports.
            </p>
            <dl className="mt-9 divide-y border-y text-sm">
              <div className="grid gap-1 py-4 sm:grid-cols-[120px_1fr]"><dt className="font-semibold">Before write</dt><dd className="text-muted-foreground">Every import is validated row by row.</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[120px_1fr]"><dt className="font-semibold">After write</dt><dd className="text-muted-foreground">Re-running reports existing records instead of duplicating them.</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[120px_1fr]"><dt className="font-semibold">Access</dt><dd className="text-muted-foreground">Staff roles can narrow further to exact properties.</dd></div>
            </dl>
          </div>
          <PortfolioRegisterProof />
        </div>
      </Section>

      <section className="bg-[var(--surface-inverse)] text-white">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:py-24 lg:px-8 lg:py-32">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_0.8fr]">
            <h2 className="max-w-4xl text-[clamp(3rem,5.3vw,5.25rem)] font-normal leading-[0.94] tracking-[-0.062em] text-balance">
              Every visible balance should have an accounting history.
            </h2>
            <p className="max-w-lg text-lg leading-8 text-white/65 lg:pb-2">
              Recurring charges, connected-account payments, cash or cheque records, allocations,
              reversals, fees and remittances post through the same double-entry ledger.
            </p>
          </div>
          <ul className="mt-10 grid border-y border-white/15 text-sm leading-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/15">
            <li className="border-b border-white/15 py-4 sm:pr-6 lg:border-b-0">Posted history is corrected by reversal, never silent editing.</li>
            <li className="border-b border-white/15 py-4 sm:pl-6 lg:border-b-0 lg:px-6">Each accounting book keeps one functional currency after posting begins.</li>
            <li className="border-b border-white/15 py-4 sm:pr-6 lg:border-b-0 lg:px-6">Settlement exceptions stay visible until an operator resolves them.</li>
            <li className="py-4 sm:pl-6">Crecy does not hold resident rent in the direct-charge model.</li>
          </ul>
        </div>
      </section>

      <Section className="!pb-20 !pt-0 lg:!pb-32 lg:!pt-0">
        <FinanceDeskProof />
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-32">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <h2 className="max-w-4xl text-[clamp(3rem,5vw,5rem)] font-normal leading-[0.95] tracking-[-0.06em] text-balance">
            A resident request becomes controlled work—not another inbox message.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-muted-foreground lg:pb-2">
            The original report, operator priority, assignment, completion evidence, cost and any owner
            decision remain parts of one maintenance record. Residents receive only the status they are allowed to see.
          </p>
        </div>
        <div className="mt-12"><MaintenanceDeskProof /></div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20">
          <div className="max-w-xl">
            <h2 className="text-[clamp(2.8rem,4.5vw,4.6rem)] font-normal leading-[0.96] tracking-[-0.058em] text-balance">
              Documents, conversations and owner reporting keep their source.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground">
              Crecy does not turn the same event into competing versions. A delivered lease retains its
              exact version. A completed repair retains its evidence and cost. A finalized statement reads
              from the property-tagged postings already in the books.
            </p>
            <p className="mt-7 border-l-2 border-primary pl-5 text-sm leading-6 text-muted-foreground">
              Operators upload and control their own leases, policies and legal documents. Crecy stores,
              scans, versions and delivers them; it does not verify their legal sufficiency.
            </p>
          </div>
          <RecordContinuityProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-24">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-3xl">
            <h2 className="text-[clamp(2.8rem,4.1vw,4.15rem)] font-normal leading-[0.98] tracking-[-0.055em] text-balance">
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
