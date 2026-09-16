import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/marketing/sections";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { CUSTOM_AGREEMENT_UNITS, GROWTH_TRIAL_COPY } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Join the Crecy pilot",
  description:
    "Crecy is in its early program. Create an account, bring a real portfolio, and run rent, maintenance, documents and owner reporting on it. 30-day no-card Growth trial.",
  path: "/pilot",
});

const STEPS: { title: string; detail: string }[] = [
  {
    title: "Create your account",
    detail:
      "Self-service signup is open. You name your organization, pick its country, currency and time zone, and accept the current terms — the version you accepted is recorded against your account.",
  },
  {
    title: "Bring a real portfolio",
    detail:
      "Add a property by hand, or import properties, units, active leases, additional household members and opening balances from CSV or Excel. Existing lease PDFs can come in with a manifest.",
  },
  {
    title: "Turn on the parts you need",
    detail:
      "Invite your team with the roles and property scopes you actually want. Invite residents and owners. Set up recurring rent. Record the payments that arrive however they arrive.",
  },
  {
    title: "Tell us what breaks",
    detail:
      "This is the point of a pilot. We would rather hear that an import mapping is wrong or a statement reads badly than find out after launch.",
  },
];

const EXPECT: { title: string; detail: string }[] = [
  {
    title: "What is working",
    detail:
      "Onboarding, portfolio and residents, lease activation, recurring rent, manual payments, write-offs, reversals, maintenance through to recorded cost, documents with delivery and acknowledgement, announcements and messaging, owner statements, and the import paths above.",
  },
  {
    title: "What needs configuration",
    detail:
      "Online card and bank payments require a verified connected payment account. Transactional email requires an operator-configured mail relay. Until those are configured, the surrounding workflow still runs — you record payments manually and deliver documents by secure link.",
  },
  {
    title: "What is not here yet",
    detail:
      "Automated owner payouts, tenant screening, inspections, a public API and custom domains are not part of the pilot. We are not going to describe them as though they are.",
  },
  {
    title: "What we ask of you",
    detail:
      "Use it for something real, and tell us when it is wrong. There is no cost during the trial and no card is required to start.",
  },
];

/**
 * The pilot / conversion page.
 *
 * Self-service signup is enabled, so per file 27 §6 that is the mechanism — this page does not invent a
 * request form, a waitlist backend, or a contact address that does not exist. It also carries no
 * customer evidence of any kind, because there is none: no logos, no counts, no testimonials, no case
 * studies. The honest version of an early-program page is a clear description of the state of the
 * product, which is what the "what to expect" section is.
 */
export default function PilotPage() {
  return (
    <>
      <Section className="!pb-10 lg:!pb-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-primary">Early operating partnership</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-balance sm:text-5xl">
            Run a real portfolio on Crecy, early.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground text-pretty">
            Crecy is in its pilot. North American availability is being prepared, and the way in is to
            create an account and use it against something real. {GROWTH_TRIAL_COPY}.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/product">See the platform</Link></Button>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Log in</Link>.
          </p>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading title="Four steps, in the order they actually happen." />
        <ol className="mt-12 border-y">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid gap-3 border-b py-6 last:border-b-0 sm:grid-cols-[50px_210px_1fr] sm:items-baseline">
              <span className="font-mono text-xs font-semibold text-primary">0{index + 1}</span>
              <span className="font-semibold">{step.title}</span>
              <span className="text-sm leading-6 text-muted-foreground">{step.detail}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading
          title="An honest account of where the product is."
          lede="A pilot is worth joining only if you know what you are joining. This is the current state, stated without rounding it up."
        />
        <dl className="mt-12 border-y">
          {EXPECT.map((item) => (
            <div key={item.title} className="grid gap-2 border-b py-5 last:border-b-0 sm:grid-cols-[210px_1fr] sm:gap-8">
              <dt className="text-base font-semibold">{item.title}</dt>
              <dd className="text-sm leading-6 text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section tone="surface">
        <div className="grid border-y lg:grid-cols-2">
          <div className="p-6 sm:p-8 lg:pr-12">
            <h2 className="text-base font-semibold">Smaller portfolios</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Start on Free with a single unit to see the whole system with your own data, or start the
              Growth trial and bring the portfolio in. No card is required to begin either.
            </p>
            <Button asChild className="mt-6"><Link href="/signup">Start free</Link></Button>
          </div>
          <div className="border-t p-6 sm:p-8 lg:border-l lg:border-t-0 lg:pl-12">
            <h2 className="text-base font-semibold">More than {CUSTOM_AGREEMENT_UNITS} units</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Above {CUSTOM_AGREEMENT_UNITS} active units Crecy works on a custom agreement rather than a
              listed plan. Create your account and raise it during onboarding, so the conversation starts
              from your real portfolio rather than an estimate.
            </p>
            <Button asChild variant="outline" className="mt-6"><Link href="/pricing">See the plans</Link></Button>
          </div>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Rental operations, finally connected.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
            One system for properties, residents, rent, maintenance, documents and owner visibility.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/security">How Crecy handles your data</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
