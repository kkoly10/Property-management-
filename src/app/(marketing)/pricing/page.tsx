import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow, Section, SectionHeading } from "@/components/marketing/sections";
import { PricingExplorer } from "@/components/marketing/pricing-explorer";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { GROWTH_TRIAL_COPY, PAYMENT_DISCLOSURE } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Pricing for the United States, Canada and Mexico",
  description:
    "Free, Starter, Growth and Pro, with included active units, overage above the Pro allowance and a 30-day no-card Growth trial. Localized price books for the US, Canada and Mexico.",
  path: "/pricing",
});

const FAQ: { question: string; answer: string }[] = [
  {
    question: "What counts as an active unit?",
    answer:
      "An operational unit that is not archived or retired during the billing day. Usage is sampled daily. Archiving a unit stops it counting going forward, but it cannot erase usage that already happened.",
  },
  {
    question: "What happens if I go above my plan's units?",
    answer:
      "On Pro, additional active units are metered at the rate shown for your price book. On the other plans you either archive units or move up a plan — a downgrade is blocked while your usage is above the destination limit.",
  },
  {
    question: "Does the trial need a card?",
    answer:
      "No. The Growth trial runs for 30 days without a card. It does not bypass connected-account verification or the production payment gates, so online payment collection still requires that verification to complete.",
  },
  {
    question: "Does Crecy take a percentage of rent?",
    answer:
      "No. Crecy charges no transaction or application fee on resident rent, and there is no mandatory resident convenience fee. You pay for the software; rent moves separately.",
  },
  {
    question: "Which currency am I billed in?",
    answer:
      "The currency of your country's price book — USD, CAD or MXN. Crecy publishes localized price books rather than converting a single currency at checkout.",
  },
  {
    question: "What if I run more than 500 units?",
    answer:
      "That is a custom agreement rather than a listed plan. Join the pilot and tell us the shape of the portfolio.",
  },
];

/**
 * The public pricing page.
 *
 * Every price, unit allowance, overage rate and entitlement on this page comes from
 * `src/lib/marketing/pricing.ts`, which a test asserts against file 11's own markdown tables. Nothing
 * is typed in here.
 */
export default function PricingPage() {
  return (
    <>
      <Section className="!pb-10 lg:!pb-12">
        <div className="max-w-3xl">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-balance sm:text-5xl">
            Priced by the units you actually operate.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground text-pretty">
            One subscription covers the operator, the team, and every resident and owner account the plan
            includes. {GROWTH_TRIAL_COPY}.
          </p>
        </div>
      </Section>

      <Section className="!pt-0 !pb-16 lg:!pt-0 lg:!pb-20">
        <PricingExplorer />
      </Section>

      <Section tone="surface">
        <SectionHeading
          eyebrow="Payments"
          title="How rent money moves, stated plainly."
          lede="Subscription billing and rent collection are two different things, and it matters that you know which one Crecy is involved in."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {PAYMENT_DISCLOSURE.map((line) => (
            <li key={line} className="rounded-xl border bg-background p-5 text-sm leading-6">{line}</li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHeading title="Questions people ask before signing up" />
        <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.question}>
              <dt className="text-base font-semibold">{item.question}</dt>
              <dd className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section tone="surface">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Try it against your own portfolio.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
            North American availability is being prepared. Start free, or join the pilot and tell us what
            you run.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pilot">Join the pilot</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
