import Link from "next/link";
import type { Metadata } from "next";
import {
  LivingPlaceProof,
  MoneyRail,
  OperatorCommandCenterProof,
  OwnerOverviewProof,
  RelationshipIndex,
  TrustProof,
  WorkflowProof,
} from "@/components/marketing/product-proof";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import { Section } from "@/components/marketing/sections";
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
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-28 lg:!pt-24">
        <div className="grid items-center gap-14 xl:grid-cols-[0.86fr_1.14fr] xl:gap-20">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(3.4rem,7vw,6.75rem)] font-normal leading-[0.88] tracking-[-0.075em] text-balance">
              The operating system for <span className="text-primary">every rental relationship.</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground text-pretty sm:text-xl sm:leading-9">
              Crecy keeps operators, residents and owners connected to the same properties, payments,
              maintenance, documents and financial records—without giving every relationship the same view.
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

          <OperatorCommandCenterProof className="min-w-0" />
        </div>
      </Section>

      <section className="bg-[var(--surface-inverse)] text-white">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:py-24 lg:px-8 lg:py-32">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <h2 className="max-w-4xl text-[clamp(2.8rem,5.8vw,5.75rem)] font-normal leading-[0.94] tracking-[-0.065em] text-balance">
              One property. Three relationships. No duplicated truth.
            </h2>
            <p className="max-w-lg text-base leading-7 text-white/65 lg:pb-2">
              The operator works the complete record. Residents receive the home-facing parts. Owners receive
              finalized financial and decision records tied to their interests.
            </p>
          </div>
          <RelationshipIndex />
        </div>
      </section>

      <SurfaceTheme surface="living">
        <section className="bg-[var(--brand-soft)]">
          <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-5 py-20 sm:py-24 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20 lg:px-8 lg:py-32">
            <div className="max-w-xl">
              <h2 className="text-[clamp(3rem,5vw,5rem)] font-normal leading-[0.96] tracking-[-0.06em] text-balance">
                Home is not a dashboard. It is the resident relationship.
              </h2>
              <p className="mt-7 text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
                Balance and the next payment come first. Maintenance, messages, documents and community
                notices stay close, while the operating books and private work remain where they belong.
              </p>
              <dl className="mt-10 border-y border-[var(--brand-strong)]/20 text-sm">
                <div className="grid gap-2 py-4 sm:grid-cols-[150px_1fr]">
                  <dt className="font-semibold">Payment clarity</dt>
                  <dd className="text-muted-foreground">Current balance, upcoming charge, method, status and receipts.</dd>
                </div>
                <div className="grid gap-2 border-t border-[var(--brand-strong)]/20 py-4 sm:grid-cols-[150px_1fr]">
                  <dt className="font-semibold">Home requests</dt>
                  <dd className="text-muted-foreground">Maintenance follows the same request the operator works.</dd>
                </div>
                <div className="grid gap-2 border-t border-[var(--brand-strong)]/20 py-4 sm:grid-cols-[150px_1fr]">
                  <dt className="font-semibold">Relationship scope</dt>
                  <dd className="text-muted-foreground">Residents see their tenancy, not someone else&rsquo;s property data.</dd>
                </div>
              </dl>
              <p className="mt-7">
                <Link href="/crecy-living" className="text-sm font-semibold text-primary hover:underline">
                  See Crecy Living →
                </Link>
              </p>
            </div>

            <LivingPlaceProof className="mx-auto w-full max-w-2xl lg:mx-0" />
          </div>
        </section>
      </SurfaceTheme>

      <Section className="!py-20 lg:!py-32">
        <div className="grid items-center gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
          <div className="max-w-xl">
            <h2 className="text-[clamp(3rem,5vw,5rem)] font-normal leading-[0.96] tracking-[-0.06em] text-balance">
              Owner visibility begins with a finalized record.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
              Statements, recorded remittances and approvals come from the same property and ledger history
              the operator already uses. Property and currency stay explicit.
            </p>
            <p className="mt-7 max-w-lg border-l-2 border-[var(--finance-accent)] pl-5 text-sm leading-6 text-muted-foreground">
              Owner access follows the ownership relationship. Resident-level details remain outside the
              owner projection.
            </p>
          </div>
          <OwnerOverviewProof className="min-w-0" />
        </div>
        <div className="mt-16 lg:mt-24"><MoneyRail /></div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-32">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <h2 className="max-w-4xl text-[clamp(3rem,5.4vw,5.5rem)] font-normal leading-[0.94] tracking-[-0.065em] text-balance">
            A maintenance request should remain one continuous story.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-muted-foreground lg:pb-2">
            The resident request, operator work, completion evidence, recorded cost and owner-facing result
            stay connected as the work moves.
          </p>
        </div>
        <WorkflowProof />
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div className="max-w-xl">
            <h2 className="text-[clamp(2.8rem,4.6vw,4.75rem)] font-normal leading-[0.96] tracking-[-0.06em] text-balance">
              Trust is a property of the architecture, not a badge wall.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground">
              Crecy uses tenant isolation, relationship-scoped portals, private document delivery, and
              audit history. Posted financial records are corrected by reversal rather than silent edit.
            </p>
            <p className="mt-7">
              <Link href="/security" className="text-sm font-semibold text-primary hover:underline">
                Read the security architecture →
              </Link>
            </p>
          </div>
          <div><TrustProof /></div>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-24">
        <div className="grid gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20">
          <div className="max-w-md">
            <h2 className="text-[clamp(2.8rem,4vw,4.25rem)] font-normal leading-[0.98] tracking-[-0.055em] text-balance">
              Start with the portfolio you have.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Local price books are published in USD, CAD, and MXN. The table below uses the United States
              price book; pricing is not converted at checkout.
            </p>
          </div>

          <div className="min-w-0 max-w-full overflow-x-auto border-y">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="border-b text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 pr-5">Plan</th>
                  <th className="px-5 py-3">Monthly</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Included active units</th>
                  <th className="py-3 pl-5"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PLAN_ORDER.map((plan) => (
                  <tr key={plan}>
                    <td className="py-4 pr-3 font-semibold sm:pr-5">
                      {PLAN_LABELS[plan]}
                      <span className="mt-1 block text-[11px] font-normal leading-4 text-muted-foreground sm:hidden">
                        {usd.plans[plan].includedUnits} active unit{usd.plans[plan].includedUnits === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td data-financial-value className="px-5 py-4 text-lg font-semibold">
                      {formatPrice(usd, usd.plans[plan].monthlyMinor)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span>
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-muted-foreground sm:table-cell">
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
