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
      <Section className="!pb-20 !pt-12 sm:!pt-20 lg:!pb-28 lg:!pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(3.6rem,7vw,7rem)] font-normal leading-[0.86] tracking-[-0.075em] text-balance">
              Home is the interface.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground text-pretty sm:text-xl sm:leading-9">
              Crecy Living connects a resident to the home they already rent: what is due, what was paid,
              what needs repair, what the operator sent and what changed at the community.
            </p>
            <p className="mt-8 max-w-lg border-l-2 border-primary pl-5 text-sm leading-6 text-muted-foreground">
              Residents enter through an operator invitation tied to their tenancy. Crecy Living is not a
              rental marketplace or a public property directory.
            </p>
          </div>

          <figure>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-muted sm:aspect-[16/9] lg:aspect-[16/10]">
              <Image
                src="/media/maple-court/marketing-exterior-v2.webp"
                alt="Maple Court's brick and limestone residential entrance in late-afternoon light."
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 100vw, 62vw"
                className={imageClass}
              />
            </div>
            <figcaption className="mt-4 flex flex-col gap-1 border-t border-[var(--brand-strong)]/20 pt-3 text-xs leading-5 text-muted-foreground sm:flex-row sm:justify-between sm:gap-6">
              <span className="font-medium text-foreground">Maple Court · Fictional Crecy demonstration community</span>
              <span>Photography contains no resident data.</span>
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-32">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <h2 className="max-w-4xl text-[clamp(3rem,5.4vw,5.5rem)] font-normal leading-[0.94] tracking-[-0.065em] text-balance">
            The community threshold belongs in the resident experience.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-muted-foreground lg:pb-2">
            A community can carry its own name, welcome line, office contact, amenities and approved
            photography without turning public presentation into access to private resident records.
          </p>
        </div>

        <figure className="mt-12">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-muted sm:aspect-[16/8] lg:aspect-[16/7]">
            <Image
              src="/media/maple-court/marketing-lobby-v2.webp"
              alt="The Maple Court lobby with a reception desk, resident seating, and garden-facing entry."
              fill
              unoptimized
              sizes="(max-width: 1280px) 100vw, 1216px"
              className={imageClass}
            />
          </div>
          <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
            The shared entrance at Maple Court. Place identity is presentation context, never authorization.
          </figcaption>
        </figure>

        <dl className="mt-10 grid border-y border-[var(--brand-strong)]/20 md:grid-cols-2">
          <div className="py-6 md:pr-8">
            <dt className="text-xl font-medium tracking-[-0.025em]">Before sign-in</dt>
            <dd className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Only intentionally public community presentation.</dd>
          </div>
          <div className="border-t py-6 md:border-l md:border-t-0 md:pl-8">
            <dt className="text-xl font-medium tracking-[-0.025em]">After sign-in</dt>
            <dd className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Only the exact home relationship authorized for that resident.</dd>
          </div>
        </dl>
      </Section>

      <Section className="!py-20 lg:!py-32">
        <div className="max-w-5xl">
          <h2 className="text-[clamp(3rem,5vw,5rem)] font-normal leading-[0.96] tracking-[-0.06em] text-balance">
            The small set of tasks that define the resident relationship.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            The resident sees one calm home surface. The underlying operating system retains the complete
            financial, maintenance and document record.
          </p>
        </div>

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20">
          <div>
            <figure>
              <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-muted">
                <Image
                  src="/media/maple-court/marketing-model-home-v2.webp"
                  alt="A Maple Court apartment with an open kitchen, living room, and balcony."
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 54vw"
                  className={imageClass}
                />
              </div>
              <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
                A Maple Court home—the context for payments, documents and repair requests.
              </figcaption>
            </figure>

            <dl className="mt-9 border-y border-[var(--brand-strong)]/20">
              {[
                ["Understand the balance", "Current charges, upcoming payment and exact currency."],
                ["Pay and keep the proof", "Method, fee and settlement status before confirmation; receipt afterward."],
                ["Ask the home to be repaired", "Issue, photo, access preference and visible progress on one request."],
                ["Keep what was sent", "Lease versions, notices, acknowledgements, messages and announcements."],
              ].map(([title, detail]) => (
                <div key={title} className="grid gap-2 border-b py-5 last:border-b-0 sm:grid-cols-[190px_1fr] sm:items-baseline sm:gap-8">
                  <dt className="font-semibold">{title}</dt>
                  <dd className="text-sm leading-6 text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mx-auto w-full max-w-md lg:sticky lg:top-28">
            <LivingHomeProof />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Representative sample data shown in the resident interface.</p>
          </div>
        </div>
      </Section>

      <section className="bg-[var(--surface-inverse)] text-white">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-20 sm:py-24 lg:grid-cols-[1.16fr_0.84fr] lg:gap-20 lg:px-8 lg:py-32">
          <figure>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-[#20293a]">
              <Image
                src="/media/maple-court/marketing-maintenance-v1.webp"
                alt="A maintenance technician inspecting the plumbing beneath a Maple Court kitchen sink."
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 56vw"
                className={imageClass}
              />
            </div>
            <figcaption className="mt-3 text-xs leading-5 text-white/55">
              A private resident request becomes accountable property work.
            </figcaption>
          </figure>

          <div className="max-w-xl">
            <h2 className="text-[clamp(3rem,4.8vw,4.75rem)] font-normal leading-[0.95] tracking-[-0.06em] text-balance">
              The resident follows the repair without seeing the back office.
            </h2>
            <p className="mt-7 text-lg leading-8 text-white/65">
              A request begins on the resident&rsquo;s phone and becomes the operator&rsquo;s work record. The
              resident sees useful progress; vendor identity, internal notes, owner decisions and cost stay
              outside the resident projection.
            </p>
            <dl className="mt-9 border-y border-white/15 text-sm">
              {[
                ["Report", "Describe the issue and attach a private photo."],
                ["Follow", "See acknowledged, scheduled, in-progress and completed states."],
                ["Return", "The same request retains updates and completion history."],
              ].map(([title, detail]) => (
                <div key={title} className="grid gap-2 border-b border-white/15 py-4 last:border-b-0 sm:grid-cols-[90px_1fr]">
                  <dt className="font-semibold text-white">{title}</dt>
                  <dd className="text-white/60">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <Section tone="surface" className="!py-20 lg:!py-32">
        <div className="grid gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
          <div className="max-w-xl">
            <h2 className="text-[clamp(3rem,4.8vw,4.75rem)] font-normal leading-[0.95] tracking-[-0.06em] text-balance">
              Privacy is visible in what the portal leaves out.
            </h2>
            <p className="mt-7 text-lg leading-8 text-muted-foreground">
              Crecy Living receives resident-safe projections. It does not become an easier path into
              operator books, owner statements, vendor details or neighboring resident data.
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
