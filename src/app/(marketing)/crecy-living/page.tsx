import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow, FeatureGrid, FeatureItem, ProductComposition, Section, SectionHeading } from "@/components/marketing/sections";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Crecy Living — the resident experience",
  description:
    "Balance and payments, receipts, maintenance requests, documents, announcements and messages, in a mobile-first portal residents can install on their phone.",
  path: "/crecy-living",
});

/**
 * Crecy Living.
 *
 * File 27 §6: "Do not market it as a public marketplace." So this page describes exactly one
 * relationship — a resident and the operator of the home they already rent — and never implies
 * listings, discovery, search, or moving between operators.
 */
export default function CrecyLivingPage() {
  return (
    <>
      <Section className="!pb-12 lg:!pb-16">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <Eyebrow>Crecy Living</Eyebrow>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-5xl">
              Everything about your home, in one place on your phone.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground text-pretty">
              Crecy Living is the resident side of Crecy. It shows what you owe, lets you pay it, keeps
              your receipts, carries your maintenance requests and holds the documents your operator sent
              you. It is not a place to find a home — it is where you live in the one you have.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Residents do not sign up on their own. Your property operator invites you, and the invitation
              is what connects your account to your tenancy.
            </p>
          </div>

          <ProductComposition label="Crecy Living · Home" className="mx-auto w-full max-w-sm">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs text-muted-foreground">Balance due</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">$1,400.00</p>
              <p className="mt-1 text-xs text-muted-foreground">September rent · due Sep 1</p>
              <div className="mt-4 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">
                Pay rent
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {[
                { label: "Kitchen sink leak", meta: "Assigned · updated yesterday" },
                { label: "Water shut-off Tuesday", meta: "Announcement from Maple Court" },
                { label: "Receipt · August rent", meta: "Paid Aug 1 · $1,400.00" },
              ].map((row) => (
                <div key={row.label} className="rounded-lg border bg-background px-3 py-2.5">
                  <p className="truncate text-sm font-medium">{row.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
                </div>
              ))}
            </div>
          </ProductComposition>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading
          eyebrow="What residents can do"
          title="The six things that actually come up."
          lede="Not a feature list for its own sake — these are the reasons a resident opens a portal at all."
        />
        <FeatureGrid>
          <FeatureItem title="See a balance you can trust">
            The balance is read from the operator&rsquo;s ledger, not a separate resident-facing number, so
            what you see is what they see.
          </FeatureItem>
          <FeatureItem title="Pay rent">
            Where the operator has enabled online payments, pay from the portal. Before confirming you see
            the amount, the currency, the method, any fee and whether it settles immediately or pends.
          </FeatureItem>
          <FeatureItem title="Keep receipts">
            Every payment — including the cash or cheque your operator recorded for you — produces a
            receipt you can open later.
          </FeatureItem>
          <FeatureItem title="Report maintenance">
            Describe the problem, attach a photo, and follow it as it is assigned and completed. The status
            you see is the status on the operator&rsquo;s work order.
          </FeatureItem>
          <FeatureItem title="Read your documents">
            Your lease, notices and anything else your operator delivered to you, with a record of what you
            acknowledged.
          </FeatureItem>
          <FeatureItem title="Get messages and announcements">
            A direct thread with your operator, plus building-wide announcements. Access and security
            messages always reach you.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      <Section>
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Mobile first"
              title="Built for a phone, installable like an app."
              lede="Crecy Living is a progressive web app. It opens in a browser, and it can be added to a home screen and launched full-screen — with no app store account, no download, and no separate password to remember."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Designed for small screens first, then scaled up — not a desktop layout squeezed down.</li>
              <li>Accessibility target: WCAG 2.2 AA.</li>
              <li>Available in the operator&rsquo;s configured locale for the United States, Canada and Mexico.</li>
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-6 sm:p-8">
            <h2 className="text-base font-semibold">What a resident can and cannot see</h2>
            <dl className="mt-5 space-y-4 text-sm leading-6">
              <div>
                <dt className="font-medium">Yours</dt>
                <dd className="mt-1 text-muted-foreground">
                  Your tenancy&rsquo;s charges, payments, receipts, maintenance requests, delivered documents
                  and messages.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Not yours</dt>
                <dd className="mt-1 text-muted-foreground">
                  Other residents&rsquo; balances or requests, the operator&rsquo;s books, owner statements,
                  or anything belonging to another property. Access is decided by your relationship to the
                  tenancy and enforced in the database, not by which screen you are on.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Your operator&rsquo;s documents</dt>
                <dd className="mt-1 text-muted-foreground">
                  Provided by your property operator. Crecy has not verified their legal sufficiency.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Residents get Crecy Living because their operator runs Crecy.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
            If you manage the property, that starts with you. If you rent it, ask your operator for an
            invitation.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/product">See the platform</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
