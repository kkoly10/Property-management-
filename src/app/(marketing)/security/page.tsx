import Link from "next/link";
import type { Metadata } from "next";
import {
  AccessBoundaryMap,
  AssuranceLedger,
  ControlStack,
  DocumentReleaseRail,
  FinancialIntegrityRail,
} from "@/components/marketing/security-architecture";
import { Section } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Security and data handling",
  description:
    "See how Crecy isolates organizations, scopes access, protects financial history, controls documents and constrains support access.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <>
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-24 lg:!pt-24">
        <div className="grid items-start gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div className="max-w-xl lg:pt-8">
            <p className="text-sm font-medium text-primary">Trust architecture</p>
            <h1 className="mt-4 text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] text-balance sm:text-[4rem]">
              Access narrows before data moves.
            </h1>
            <p className="mt-7 text-lg leading-8 text-muted-foreground text-pretty">
              Crecy holds rental, identity, document and financial records for organizations that have
              nothing to do with one another. Isolation is therefore the shape of the system—not a badge
              added to the website.
            </p>
            <p className="mt-6 border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">
              This page describes controls present in the product architecture. It does not represent an
              independent certification or guarantee.
            </p>
          </div>
          <AccessBoundaryMap />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:gap-16">
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.65rem]">
              A screen is not an authorization boundary.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Hiding a navigation item does not protect a record. Crecy combines role, active organization,
              property scope and the resident or owner relationship at the command and database layers.
            </p>
          </div>
          <ControlStack />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-primary">Financial integrity</p>
          <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
            The most useful protection is knowing the old number cannot quietly change.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Posted journal entries are append-only. A correction reverses and replaces the original, each
            transaction stays within one accounting book and currency, and retried commands return their
            original result instead of posting twice.
          </p>
        </div>
        <div className="mt-12">
          <FinancialIntegrityRail />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">Document release</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.65rem]">
              A new upload is unavailable by default.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Files live in private storage. A lease or notice must pass the quarantine and scan lifecycle
              before an access-checked, short-lived link can expose it to an authorized recipient.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Versions supersede instead of overwrite, preserving the exact artifact a resident or owner
              received and acknowledged.
            </p>
          </div>
          <DocumentReleaseRail />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-sm font-medium text-primary">Payments</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance">
              Crecy does not hold resident rent.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Online payments are processed through eligible operators&rsquo; connected payment accounts.
              Card numbers and bank credentials are handled by the payment provider; Crecy stores provider
              references rather than payment instruments.
            </p>
            <ul className="mt-8 divide-y border-y text-sm leading-6">
              <li className="py-4">The payer sees merchant, amount, currency, method, fee and settlement behavior before confirmation.</li>
              <li className="py-4">Provider webhooks are signature-verified and handled idempotently.</li>
              <li className="py-4">The operator remains merchant of record for its own rent.</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-primary">Support access</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance">
              Support has no standing customer-data access.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              A support session is deliberate, time-boxed and recorded. Its reads are purpose-built,
              sanitized and read-only; opening a session does not bypass tenant row policies.
            </p>
            <ul className="mt-8 divide-y border-y text-sm leading-6">
              <li className="py-4">One active support session per staff member.</li>
              <li className="py-4">No support command can write to customer records.</li>
              <li className="py-4">Each support read creates its own audit evidence.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">Evidence ledger</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.65rem]">
              Built controls and external assurances are different things.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Crecy explains what the architecture does and states plainly what has not been independently
              assured. Crecy holds no SOC 2 or equivalent certification.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              There is no published uptime percentage or penetration-test claim without a defined evidence
              period, signed scope and remediation record. WCAG 2.2 AA remains the accessibility target,
              not an external conformance claim.
            </p>
          </div>
          <AssuranceLedger />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-24">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              Review the controls. Ask about the evidence. Expect precise answers.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              North American availability is being prepared alongside payment, privacy, support and
              localization gates.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="outline"><Link href="/legal">Read legal documents</Link></Button>
            <Button asChild size="lg"><Link href="/pilot">Join the pilot</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
