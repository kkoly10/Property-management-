import type { Metadata } from "next";
import { CalendarDays, CarFront, CircleDollarSign, DoorOpen, PawPrint, UtilityPole } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPublicRentalListing } from "@/lib/data/rental-listings";
import { RentalInquiryForm } from "./inquiry-form";
import { RentalTourForm } from "./tour-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 })
    .format(amountMinor / 100);
}
function locationText(location: { locality: string | null; subdivisionCode: string | null; countryCode: string }) {
  return [location.locality, location.subdivisionCode, location.countryCode].filter(Boolean).join(", ");
}

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) return { title: "Rental listing · Crecy", robots: { index: false, follow: false } };
  const listing = await getPublicRentalListing(publicId);
  return {
    title: listing ? `${listing.title} · Crecy Rentals` : "Rental listing · Crecy",
    description: listing?.summary.slice(0, 160),
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function SharedRentalListingPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) notFound();
  const listing = await getPublicRentalListing(publicId);
  if (!listing) notFound();
  const location = locationText(listing.location);

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:py-12 lg:px-8">
      {listing.preview ? (
        <div className="mb-5 rounded-lg border bg-white px-4 py-3 text-xs text-muted-foreground">
          Representative local preview. A connected listing uses the landlord&apos;s scanner-clean photos and saved listing details.
        </div>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:gap-12">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-[1.5rem] border bg-white">
            {listing.photos[0]?.url ? (
              // Public share pages receive only short-lived signed URLs for exact scanner-clean versions.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.photos[0].url} alt={listing.photos[0].altText || listing.title}
                className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-muted text-sm text-muted-foreground sm:aspect-[16/9]">
                Photo temporarily unavailable
              </div>
            )}
          </div>
          {listing.photos.length > 1 ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listing.photos.slice(1, 7).map((photo, index) => (
                <div key={index} className="overflow-hidden rounded-xl border bg-white">
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt={photo.altText || `${listing.title} photo ${index + 2}`}
                      className="aspect-[4/3] w-full object-cover" />
                  ) : <div className="aspect-[4/3] bg-muted" />}
                </div>
              ))}
            </div>
          ) : null}

        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[1.5rem] border bg-white p-6 shadow-[0_18px_50px_rgba(31,35,48,.08)]">
            <p className="text-sm font-semibold text-primary">Unlisted rental</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-balance">{listing.title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{location}</p>
            <div className="mt-6 flex items-end justify-between gap-4 border-y py-5">
              <div>
                <p className="text-xs text-muted-foreground">Monthly rent</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{money(listing.rentAmountMinor, listing.currencyCode)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="mt-1 text-sm font-semibold">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${listing.availableOn}T00:00:00Z`))}</p>
              </div>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-foreground/85">{listing.summary}</p>
            <div className="mt-6 rounded-xl bg-muted/55 p-4 text-sm leading-6 text-muted-foreground">
              This landlord shared the page directly. Crecy marketplace discovery is not enabled for this listing.
              You can send a verified question or request a tour below without creating a renter account.
            </div>
          </div>
          <div className="mt-4 rounded-[1.5rem] border bg-white p-6">
            <p className="text-sm font-semibold text-primary">Ask about this rental</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">Send the landlord a verified question</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your question appears in the landlord&apos;s Crecy workspace only after you verify your email.
            </p>
            <div className="mt-5">
              <RentalInquiryForm publicId={listing.publicId} />
            </div>
          </div>
          <div className="mt-4 rounded-[1.5rem] border bg-white p-6">
            <p className="text-sm font-semibold text-primary">See the rental</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">Request a verified tour</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Suggest up to three times. The landlord confirms one separately after your email is verified.
            </p>
            <div className="mt-5">
              <RentalTourForm publicId={listing.publicId} timeZone={listing.timeZone} />
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-12 border-t pt-10">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="text-sm font-semibold text-primary">Rental details</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Know what is included before you ask.</h2>
          </div>
          <div className="grid gap-0 border-y sm:grid-cols-2">
            <Detail icon={DoorOpen} label="Space" value={[
              listing.unitType?.replaceAll("_", " "),
              listing.bedrooms == null ? null : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}`,
              listing.bathrooms == null ? null : `${listing.bathrooms} bathroom${listing.bathrooms === 1 ? "" : "s"}`,
            ].filter(Boolean).join(" · ") || "Ask the landlord"} />
            <Detail icon={CalendarDays} label="Lease term" value={listing.leaseTermText || "Ask the landlord"} />
            <Detail icon={UtilityPole} label="Utilities" value={listing.utilitiesText || "Ask the landlord"} />
            <Detail icon={CarFront} label="Parking" value={listing.parkingText || "Ask the landlord"} />
            <Detail icon={PawPrint} label="Pets" value={listing.petsText || "Ask the landlord"} />
            <Detail icon={CircleDollarSign} label="Rent" value={`${money(listing.rentAmountMinor, listing.currencyCode)} / month`} />
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-[1.5rem] bg-[#111827] px-6 py-8 text-white sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">Privacy boundary</p>
        <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.035em]">The listing is public to anyone with this link. The management record is not.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65">
          This page does not expose the property&apos;s full street address, postal code, tenant records,
          payments, private documents or the landlord&apos;s Crecy workspace.
        </p>
      </section>
    </div>
  );
}

function Detail({
  icon: Icon, label, value,
}: {
  icon: typeof DoorOpen; label: string; value: string;
}) {
  return (
    <div className="border-b p-5 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
      <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
