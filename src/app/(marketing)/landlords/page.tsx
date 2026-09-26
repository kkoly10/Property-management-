import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, FileCheck2, House, KeyRound, Wrench } from "lucide-react";
import { Section } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Property management for self-managing landlords",
  description:
    "Rent out a home, basement or room and keep the agreement, rent, maintenance, documents and resident access connected in Crecy.",
  path: "/landlords",
});

const steps = [
  ["01", "Add the rental", "Describe the home or the part of it you rent. The management record stays private by default."],
  ["02", "Record the renter", "Bring the signed agreement and renter you already found. Crecy waits for the document scan before activation."],
  ["03", "Choose where Crecy starts", "Confirm the first rent charge Crecy should manage and any opening balance instead of recreating old history."],
  ["04", "Invite the resident", "The renter enters Crecy Living for the agreement, payments, maintenance, messages and documents tied to that tenancy."],
] as const;
export default function LandlordsPage() {
  return (
    <>
      <Section className="!pb-16 !pt-14 sm:!pt-20 lg:!pb-24 lg:!pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">For self-managing landlords</p>
            <h1 className="mt-4 text-[clamp(3.2rem,6.6vw,6.4rem)] font-normal leading-[0.9] tracking-[-0.07em] text-balance">
              Rent out one place. <span className="text-primary">Keep the whole rental connected.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
              Crecy gives you a simpler rental workspace for the agreement, rent, maintenance, documents,
              messages and resident access—without making you operate a professional property-management dashboard.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup?path=self_managing">Set up my rental</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/product">See the full platform</Link>
              </Button>
            </div>
          </div>
          <div className="min-w-0 rounded-[1.75rem] border bg-card p-5 shadow-[0_24px_70px_rgba(31,35,48,.09)] sm:p-7">
            <div className="flex items-center justify-between border-b pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">My rental</p>
                <p className="mt-1 text-xl font-semibold tracking-[-0.03em]">Basement apartment</p>
              </div>
              <span className="rounded-full bg-[var(--brand-subtle)] px-3 py-1.5 text-xs font-semibold text-primary">
                Private record
              </span>
            </div>
            <div className="grid gap-0 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
              <div className="py-6 sm:pr-6">
                <p className="text-xs font-medium text-muted-foreground">Agreement</p>
                <div className="mt-3 flex items-start gap-3">
                  <FileCheck2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div><p className="font-semibold">Signed agreement recorded</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Exact scanned version stays attached to the tenancy.</p></div>
                </div>
              </div>
              <div className="hidden w-px bg-border sm:block" />
              <div className="border-t py-6 sm:border-t-0 sm:pl-6">
                <p className="text-xs font-medium text-muted-foreground">Resident</p>
                <div className="mt-3 flex items-start gap-3">
                  <KeyRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div><p className="font-semibold">Crecy Living invitation</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Access begins only after the renter accepts the invitation.</p></div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Rent</p><p className="mt-1 font-mono text-lg font-semibold">$1,350</p></div>
              <div><p className="text-xs text-muted-foreground">First Crecy charge</p><p className="mt-1 text-sm font-semibold">Oct 1</p></div>
              <div><p className="text-xs text-muted-foreground">Maintenance</p><p className="mt-1 text-sm font-semibold">Connected</p></div>
            </div>
          </div>
        </div>
      </Section>

      <section className="bg-[var(--surface-inverse)] text-white">
        <div className="mx-auto max-w-[1280px] px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <h2 className="max-w-4xl text-[clamp(2.8rem,5vw,5.25rem)] font-normal leading-[0.94] tracking-[-0.06em] text-balance">
              Finding a renter and managing a rental are different jobs.
            </h2>
            <p className="max-w-lg text-base leading-7 text-white/65">
              Crecy is useful even when the renter came from somewhere else. Start with the relationship
              you already have, or create an unlisted Crecy page and bring your own traffic to it.
            </p>
          </div>
          <div className="mt-14 divide-y divide-white/15 border-y border-white/15">
            {steps.map(([number, title, description]) => (
              <div key={number} className="grid gap-3 py-6 sm:grid-cols-[72px_200px_1fr] sm:gap-6">
                <span className="font-mono text-sm text-white/45">{number}</span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="max-w-2xl text-sm leading-6 text-white/65">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Section className="!py-20 lg:!py-28">
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="max-w-xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-subtle)] text-primary">
              <House aria-hidden="true" className="h-6 w-6" />
            </span>
            <h2 className="mt-6 text-[clamp(2.7rem,4.7vw,4.8rem)] font-normal leading-[0.96] tracking-[-0.055em] text-balance">
              Built for a rental relationship, not a portfolio org chart.
            </h2>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              A self-managing workspace hides professional owner-reporting and vendor operations you do not
              need, while keeping the same tenancy, document, maintenance and financial foundations underneath.
            </p>
          </div>

          <div className="border-y">
            <div className="grid gap-4 border-b py-7 sm:grid-cols-[180px_1fr]">
              <p className="font-semibold">Your rental</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Home, basement, room or apartment details stay in the private management record unless you later choose to publish a listing.
              </p>
            </div>
            <div className="grid gap-4 border-b py-7 sm:grid-cols-[180px_1fr]">
              <p className="font-semibold">Your agreement</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Upload the agreement already signed by the required parties. Crecy records and operationalizes it; Crecy does not certify its legal sufficiency.
              </p>
            </div>
            <div className="grid gap-4 border-b py-7 sm:grid-cols-[180px_1fr]">
              <p className="font-semibold">Your cutover</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Choose the first rent charge Crecy should manage and record the current balance separately,
                so starting today does not invent charges for months already handled elsewhere.
              </p>
            </div>
            <div className="grid gap-4 py-7 sm:grid-cols-[180px_1fr]">
              <p className="font-semibold">Your renter</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Invite the resident into Crecy Living after the tenancy is ready. Their view stays scoped to
                the rental relationship rather than exposing your management workspace.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="surface" className="!py-20 lg:!py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
          <div>
            <p className="text-sm font-semibold text-primary">Current release boundary</p>
            <h2 className="mt-4 max-w-3xl text-[clamp(2.6rem,4.5vw,4.6rem)] font-normal leading-[0.97] tracking-[-0.055em] text-balance">
              Bring your own renter. Bring your own traffic.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Crecy is not promising marketplace traffic in this release. The self-managing workflow works
              with a renter you already found, and an unlisted shareable page lets you bring prospects from
              your own channels. Crecy discovery, inquiries, tours and applications remain separate expansion work.
            </p>
          </div>
          <div className="rounded-[1.5rem] border bg-card p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <Wrench aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h3 className="text-lg font-semibold">After move-in, the record continues.</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Rent, maintenance, messages and documents stay tied to the same tenancy instead of
                  becoming a second system after the lease is signed.
                </p>
              </div>
            </div>
            <div className="mt-6 border-t pt-5 text-sm leading-6 text-muted-foreground">
              Rent uses the operator&apos;s connected payment account where enabled. Crecy does not pool or hold resident rent.
            </div>
          </div>
        </div>
      </Section>

      <Section className="!py-20 lg:!py-24">
        <div className="grid items-end gap-8 border-t pt-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-[2.75rem]">
              Have a place you manage yourself?
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Create the rental workspace first. You can bring the existing renter and signed agreement with you.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/signup?path=self_managing">
              Set up my rental <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
