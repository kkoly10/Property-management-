import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Section, StatementList } from "@/components/marketing/sections";
import { PricingExplorer } from "@/components/marketing/pricing-explorer";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { CUSTOM_AGREEMENT_UNITS, GROWTH_TRIAL_COPY, PAYMENT_DISCLOSURE } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Pricing for the United States, Canada and Mexico",
  description:
    "Free, Starter, Growth and Pro, with included active units, overage above the Pro allowance and a 30-day no-card Growth trial. Localized price books for the US, Canada and Mexico.",
  path: "/pricing",
});

const FAQ: { question: string; answer: string }[] = [
  { question: "What counts as an active unit?", answer: "An operational unit that is not archived or retired during the billing day. Usage is sampled daily. Archiving a unit stops it counting going forward, but it cannot erase usage that already happened." },
  { question: "What happens if I go above my plan's units?", answer: "On Pro, additional active units are metered at the rate shown for your price book. On the other plans you either archive units or move up a plan — a downgrade is blocked while your usage is above the destination limit." },
  { question: "Does the trial need a card?", answer: "No. The Growth trial runs for 30 days without a card. It does not bypass connected-account verification or the production payment gates, so online payment collection still requires that verification to complete." },
  { question: "Does Crecy take a percentage of rent?", answer: "No. Crecy charges no transaction or application fee on resident rent, and there is no mandatory resident convenience fee. You pay for the software; rent moves separately." },
  { question: "Which currency am I billed in?", answer: "The currency of your country's price book — USD, CAD or MXN. Crecy publishes localized price books rather than converting a single currency at checkout." },
  { question: `What if I run more than ${CUSTOM_AGREEMENT_UNITS} units?`, answer: "That is a custom agreement rather than a listed plan. Join the pilot and tell us the shape of the portfolio." },
];

export default function PricingPage() {
  return (
    <>
      <Section className="!pb-8 !pt-14 sm:!pt-20 lg:!pb-10 lg:!pt-24">
        <div className="max-w-4xl">
          <h1 className="text-[clamp(3.4rem,6.6vw,6.3rem)] font-normal leading-[0.9] tracking-[-0.07em] text-balance">
            Pay for the portfolio you actually operate.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground text-pretty sm:text-xl sm:leading-9">
            One subscription covers the operator, the team, and every resident and owner account the plan
            includes. {GROWTH_TRIAL_COPY}.
          </p>
        </div>
      </Section>

      <Section className="!pt-8 lg:!pt-10">
        <PricingExplorer />
      </Section>

      <section className="bg-[var(--surface-inverse)] text-white">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:py-24 lg:px-8 lg:py-28">
          <div className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-end">
            <h2 className="max-w-4xl text-[clamp(2.9rem,5vw,4.9rem)] font-normal leading-[0.95] tracking-[-0.06em] text-balance">
              The software bill and the resident&rsquo;s rent are two different money flows.
            </h2>
            <p className="max-w-lg text-lg leading-8 text-white/65 lg:pb-2">
              That separation is part of the product model, not fine print. Crecy bills the organization for
              software; resident rent moves through the operator&rsquo;s eligible connected payment account.
            </p>
          </div>

          <div className="mt-12 grid border-y border-white/15 md:grid-cols-2 md:divide-x md:divide-white/15">
            <div className="border-b border-white/15 py-6 md:border-b-0 md:pr-8">
              <p className="text-sm font-semibold">Crecy subscription</p>
              <p className="mt-3 text-3xl font-normal tracking-[-0.04em]">Software</p>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/65">Plan, active-unit allowance and any published overage belong to the organization&rsquo;s software subscription.</p>
            </div>
            <div className="py-6 md:pl-8">
              <p className="text-sm font-semibold">Resident payment</p>
              <p className="mt-3 text-3xl font-normal tracking-[-0.04em]">Rent</p>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/65">Crecy does not take a percentage of resident rent and does not hold rent in the direct-charge model.</p>
            </div>
          </div>
        </div>
      </section>

      <Section className="!py-20 lg:!py-24">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <div className="max-w-lg">
            <h2 className="text-[clamp(2.7rem,4.2vw,4.2rem)] font-normal leading-[0.97] tracking-[-0.055em] text-balance">
              The rest of the payment boundary, stated plainly.
            </h2>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Fees, settlement behavior and connected-account requirements should be visible before someone
              decides how to collect rent.
            </p>
          </div>
          <StatementList items={PAYMENT_DISCLOSURE} columns={1} />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.65fr_1.35fr] lg:gap-20">
          <div className="max-w-lg">
            <h2 className="text-[clamp(2.7rem,4vw,4.1rem)] font-normal leading-[0.98] tracking-[-0.052em] text-balance">
              Questions people ask before signing up.
            </h2>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.question} className="border-t pt-5">
                <dt className="text-base font-semibold">{item.question}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-24">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-3xl">
            <h2 className="text-[clamp(2.8rem,4.1vw,4.15rem)] font-normal leading-[0.98] tracking-[-0.055em] text-balance">
              Price the software first. Then test it against the portfolio you actually run.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              North American availability is being prepared. Start free, or use the pilot to work through migration and configuration with real operating data.
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
