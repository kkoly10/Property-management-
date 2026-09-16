import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import { LivingHomeProof } from "@/components/marketing/product-proof";
import { Section } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Crecy Living — the resident experience",
  description:
    "A place-led resident experience for balance and payments, receipts, maintenance, documents, announcements and messages.",
  path: "/crecy-living",
});

const imageClass = "h-full w-full object-cover";

export default function CrecyLivingPage() {
  return (
    <SurfaceTheme surface="living" className="bg-background">
      <Section className="!pb-16 !pt-10 sm:!pt-16 lg:!pb-24 lg:!pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-primary">Crecy Living</p>
            <h1 className="mt-4 text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] text-balance sm:text-[4rem]">
              Your home has a place in the product.
            </h1>
            <p className="mt-7 text-lg leading-8 text-muted-foreground text-pretty">
              Crecy Living connects the resident to the home they already rent: what is due, what was
              paid, what needs repair, what the operator sent, and what changed at the community.
            </p>
            <p className="mt-6 border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">
              Residents enter through an operator invitation tied to their tenancy. Crecy Living is not a
              rental marketplace or a public property directory.
            </p>
          </div>

          <figure>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-muted">
              <Image
                src="/media/maple-court/marketing-exterior-v2.webp"
                alt="Maple Court's brick and limestone residential entrance in late-afternoon light."
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 100vw, 62vw"
                className={imageClass}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-5 pb-5 pt-16 text-white sm:px-7 sm:pb-7">
                <p className="text-lg font-semibold">Maple Court</p>
                <p className="mt-1 text-sm text-white/80">Fictional Crecy demonstration community</p>
              </div>
            </div>
          </figure>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <figure>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1rem] bg-muted">
              <Image
                src="/media/maple-court/marketing-lobby-v2.webp"
                alt="The Maple Court lobby with a reception desk, resident seating, and garden-facing entry."
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 58vw"
                className={imageClass}
              />
            </div>
            <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
              Community photography carries place identity; it never grants access to resident data.
            </figcaption>
          </figure>

          <div className="max-w-lg">
            <p className="text-sm font-medium text-primary">Community first</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              The portal begins at the resident&rsquo;s front door—not at a dashboard.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              An operator can publish a community name, welcome line, office contact, amenities and
              approved photography. That public presentation stays separate from balances, documents,
              maintenance and every other authenticated relationship.
            </p>
            <dl className="mt-8 divide-y border-y text-sm">
              <div className="grid gap-2 py-4 sm:grid-cols-[130px_1fr]">
                <dt className="font-semibold">Before sign-in</dt>
                <dd className="text-muted-foreground">Only intentionally public community presentation.</dd>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[130px_1fr]">
                <dt className="font-semibold">After sign-in</dt>
                <dd className="text-muted-foreground">The exact home relationship authorized for that resident.</dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid items-start gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-16">
          <div>
            <figure>
              <div className="relative aspect-[16/10] overflow-hidden rounded-[1rem] bg-muted">
                <Image
                  src="/media/maple-court/marketing-model-home-v2.webp"
                  alt="A Maple Court apartment with an open kitchen, living room, and balcony."
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 54vw"
                  className={imageClass}
                />
              </div>
            </figure>

            <div className="mt-8 max-w-2xl">
              <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
                The small set of tasks that define the resident relationship.
              </h2>
              <ol className="mt-8 border-y">
                {[
                  ["01", "Understand the balance", "Current charges, upcoming payment and exact currency."],
                  ["02", "Pay and keep the proof", "Method, fee and settlement status before confirmation; receipt afterward."],
                  ["03", "Ask the home to be repaired", "Issue, photo, access preference and visible progress on one request."],
                  ["04", "Keep what was sent", "Lease versions, notices, acknowledgements, messages and announcements."],
                ].map(([number, title, detail]) => (
                  <li key={number} className="grid gap-2 border-b py-5 last:border-b-0 sm:grid-cols-[44px_190px_1fr] sm:items-baseline">
                    <span className="font-mono text-xs text-primary">{number}</span>
                    <span className="font-semibold">{title}</span>
                    <span className="text-sm leading-6 text-muted-foreground">{detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <LivingHomeProof className="mx-auto w-full max-w-md lg:sticky lg:top-28" />
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <figure>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1rem] bg-muted">
              <Image
                src="/media/maple-court/marketing-maintenance-v1.webp"
                alt="A maintenance technician inspecting the plumbing beneath a Maple Court kitchen sink."
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 56vw"
                className={imageClass}
              />
            </div>
          </figure>

          <div className="max-w-lg">
            <p className="text-sm font-medium text-primary">One request, both sides</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              The resident follows the work without seeing the back office.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              A maintenance request begins on the resident&rsquo;s phone and becomes the operator&rsquo;s work
              record. The resident sees the useful progress; vendor identity, internal notes, owner
              decisions and cost remain outside the resident projection.
            </p>
            <ol className="mt-8 divide-y border-y text-sm">
              {[
                ["Report", "Describe the issue and attach a private photo."],
                ["Follow", "See acknowledged, scheduled, in-progress and completed states."],
                ["Return", "The same request retains updates and completion history."],
              ].map(([title, detail]) => (
                <li key={title} className="grid gap-2 py-4 sm:grid-cols-[90px_1fr]">
                  <span className="font-semibold">{title}</span>
                  <span className="text-muted-foreground">{detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">Relationship boundary</p>
            <h2 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.6rem]">
              A resident portal should be deliberately smaller than the operating system.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Crecy Living receives resident-safe projections. It does not become an easier path into
              operator, owner or neighboring resident data.
            </p>
          </div>
          <dl className="border-y">
            {[
              ["Yours", "Your tenancy’s charges, payments, receipts, maintenance requests, delivered documents and messages."],
              ["Not yours", "Other residents’ records, operator books, owner statements, vendor details and internal notes."],
              ["Operator documents", "Provided by your property operator. Crecy has not verified their legal sufficiency."],
              ["Mobile experience", "Designed for small screens and installable as a progressive web app."],
            ].map(([term, detail]) => (
              <div key={term} className="grid gap-2 border-b py-5 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-8">
                <dt className="font-semibold">{term}</dt>
                <dd className="text-sm leading-6 text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-24">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              Residents receive Crecy Living through the operator of their home.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              If you manage the property, Crecy Living becomes the resident side of the operating record.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/product">See Crecy OS</Link></Button>
          </div>
        </div>
      </Section>
    </SurfaceTheme>
  );
}
