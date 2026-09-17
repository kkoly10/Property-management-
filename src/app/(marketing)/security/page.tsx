import Link from "next/link";
import type { Metadata } from "next";
import {
  AssuranceLedger,
  DocumentCustodyProof,
  LedgerCorrectionProof,
  PaymentBoundaryProof,
  PropertyAccessBoundary,
  RelationshipProjectionProof,
  SupportAccessRecord,
} from "@/components/marketing/security-architecture";
import { Section } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Security and data handling",
  description:
    "See how Crecy isolates organizations, scopes resident and owner access, protects financial history, controls documents and constrains support access.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <>
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-24 lg:!pt-24">
        <div className="grid items-start gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-xl lg:pt-10">
            <h1 className="text-[3rem] font-medium leading-[0.94] tracking-[-0.065em] text-balance sm:text-[4.6rem] lg:text-[5.15rem]">
              Every record has a boundary.
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground text-pretty sm:text-xl sm:leading-9">
              Crecy keeps the operating record whole while deliberately narrowing what residents, owners,
              staff and support can reach. The boundary follows the relationship—not the navigation menu.
            </p>
            <div className="mt-9 border-t pt-5 text-sm leading-6 text-muted-foreground">
              This page describes controls present in the product architecture. It does not represent an
              independent certification or guarantee.
            </div>
          </div>
          <PropertyAccessBoundary />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.66fr_1.34fr] lg:gap-16">
          <div className="max-w-md">
            <h2 className="text-3xl font-medium leading-[1.03] tracking-[-0.045em] text-balance sm:text-[3.1rem]">
              One property does not mean one view.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              The operator works from the property record. A resident receives the tenancy-facing projection.
              An owner receives the ownership-facing projection. Each relationship is intentionally smaller
              than the operating system behind it.
            </p>
          </div>
          <RelationshipProjectionProof />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-medium leading-[1.03] tracking-[-0.045em] text-balance sm:text-[3.25rem]">
            A correction leaves a trail.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Posted journal entries are append-only. A correction reverses and replaces the original instead
            of silently rewriting history. Transactions remain inside one accounting book and currency, and
            retried commands return their original result instead of posting twice.
          </p>
        </div>
        <div className="mt-12 lg:mt-14">
          <LedgerCorrectionProof />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-md">
            <h2 className="text-3xl font-medium leading-[1.03] tracking-[-0.045em] text-balance sm:text-[3rem]">
              A document is unavailable until it earns release.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Files live in private storage. A lease, notice or statement must pass the quarantine and scan
              lifecycle before an access-checked, short-lived link can expose an exact version to an
              authorized recipient.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Versions supersede instead of overwrite, preserving the artifact a resident or owner actually
              received and acknowledged.
            </p>
          </div>
          <DocumentCustodyProof />
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-medium leading-[1.03] tracking-[-0.045em] text-balance sm:text-[3.25rem]">
            Money and support take narrower paths.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Crecy records payment truth without holding resident rent, and support receives no standing path
            into customer data. Both flows are deliberately constrained before they begin.
          </p>
        </div>
        <div className="mt-12 space-y-14 lg:mt-14 lg:space-y-16">
          <PaymentBoundaryProof />
          <SupportAccessRecord />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-md">
            <h2 className="text-3xl font-medium leading-[1.03] tracking-[-0.045em] text-balance sm:text-[3rem]">
              Built controls are not the same as external assurance.
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
            <h2 className="text-3xl font-medium leading-[1.04] tracking-[-0.045em] text-balance sm:text-[3rem]">
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
