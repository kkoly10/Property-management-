import Link from "next/link";
import type { Metadata } from "next";
import {
  ImportReadinessProof,
  PilotActivationFlow,
  PilotReadinessBoard,
  PilotStatusRegister,
} from "@/components/marketing/pilot-operating-story";
import { Section } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";
import { CUSTOM_AGREEMENT_UNITS, GROWTH_TRIAL_COPY } from "@/lib/marketing/pricing";

export const metadata: Metadata = marketingMetadata({
  title: "Join the Crecy pilot",
  description:
    "Crecy is in its early program. Create an account, bring a real portfolio, and run rent, maintenance, documents and owner reporting on it. 30-day no-card Growth trial.",
  path: "/pilot",
});

export default function PilotPage() {
  return (
    <>
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-24 lg:!pt-24">
        <div className="grid items-center gap-14 xl:grid-cols-[0.82fr_1.18fr] xl:gap-20">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(3.35rem,6.6vw,6.4rem)] font-normal leading-[0.9] tracking-[-0.072em] text-balance">
              Bring one real property. Leave with an operating record.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground text-pretty sm:text-xl sm:leading-9">
              Crecy is in its pilot. North American availability is being prepared, and the useful way to
              evaluate it is against the portfolio you already run. {GROWTH_TRIAL_COPY}.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/product">See the operating model</Link></Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Log in</Link>.
            </p>
          </div>
          <PilotReadinessBoard />
        </div>
      </Section>

      <section className="bg-[var(--surface-inverse)] text-white">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:py-24 lg:px-8 lg:py-28">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <h2 className="max-w-4xl text-[clamp(2.8rem,5.2vw,5rem)] font-normal leading-[0.94] tracking-[-0.06em] text-balance">
              The pilot is an activation process, not a waitlist.
            </h2>
            <p className="max-w-lg text-base leading-7 text-white/65 lg:pb-2">
              Establish the organization, bring the portfolio, connect the real relationships and make the
              remaining configuration visible before the operating day begins.
            </p>
          </div>
          <div className="mt-12 [&_*]:border-white/15 [&_p]:text-white/70 [&_span]:text-white/70 [&_span]:border-white/30">
            <PilotActivationFlow />
          </div>
        </div>
      </section>

      <Section className="!py-20 lg:!py-32">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div className="max-w-xl lg:pt-4">
            <h2 className="text-[clamp(2.8rem,4.6vw,4.65rem)] font-normal leading-[0.96] tracking-[-0.058em] text-balance">
              Migration should expose uncertainty before it becomes operating data.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground">
              Crecy can import properties, units, active leases, household members, opening balances and
              lease documents. The important part is not accepting a file—it is making the rows that still
              need an operator decision impossible to miss.
            </p>
            <p className="mt-7 border-l-2 border-primary pl-5 text-sm leading-6 text-muted-foreground">
              Imports validate before write. Re-running an accepted import reports existing records rather
              than quietly duplicating them.
            </p>
          </div>
          <ImportReadinessProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-10 lg:grid-cols-[0.62fr_1.38fr] lg:gap-20">
          <div className="max-w-md">
            <h2 className="text-[clamp(2.7rem,4.2vw,4.25rem)] font-normal leading-[0.97] tracking-[-0.055em] text-balance">
              Know exactly what you are piloting.
            </h2>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Early software is only useful when its limits are explicit. These are the current boundaries,
              stated without rounding them up into future promises.
            </p>
          </div>
          <PilotStatusRegister />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="max-w-xl">
            <h2 className="text-[clamp(2.8rem,4.5vw,4.6rem)] font-normal leading-[0.96] tracking-[-0.058em] text-balance">
              Start from the portfolio size you actually have.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground">
              A single unit can use Free to understand the whole system. A working portfolio can use the
              Growth trial. Above {CUSTOM_AGREEMENT_UNITS} active units, Crecy uses a custom agreement rather than pretending a listed plan fits.
            </p>
          </div>

          <div className="border-y">
            <div className="grid gap-4 border-b py-6 sm:grid-cols-[170px_1fr_auto] sm:items-center">
              <p className="font-semibold">1–{CUSTOM_AGREEMENT_UNITS} units</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Create the account, choose the plan, and bring the real portfolio into onboarding.
              </p>
              <Button asChild><Link href="/signup">Start free</Link></Button>
            </div>
            <div className="grid gap-4 py-6 sm:grid-cols-[170px_1fr_auto] sm:items-center">
              <p className="font-semibold">{CUSTOM_AGREEMENT_UNITS + 1}+ units</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Start with the same account flow and surface the portfolio size during onboarding so the
                agreement starts from real operating scope.
              </p>
              <Button asChild variant="outline"><Link href="/pricing">See pricing</Link></Button>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-24">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-3xl">
            <h2 className="text-[clamp(2.7rem,4vw,4rem)] font-normal leading-[0.98] tracking-[-0.052em] text-balance">
              Bring the operating reality. Crecy will show you where the record is ready—and where it is not.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              No card is required to begin. No customer logos, implementation claims or future capabilities are being invented for this pilot page.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/security">Review security</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
