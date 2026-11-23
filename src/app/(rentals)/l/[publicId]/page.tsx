import type { Metadata } from "next";
import { CalendarDays, CarFront, DoorOpen, MapPin, PawPrint, UtilityPole } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { getPublicRentalListing } from "@/lib/data/rental-listings";
import { RentalListingActions } from "./rental-listing-actions";
import { RentalListingGallery } from "./rental-listing-gallery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 })
    .format(amountMinor / 100);
}
function locationText(location: { locality: string | null; subdivisionCode: string | null; countryCode: string }) {
  return [location.locality, location.subdivisionCode, location.countryCode].filter(Boolean).join(", ");
}
function localDateAfterDays(timeZone: string, dayOffset: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + dayOffset))
    .toISOString().slice(0, 10);
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
  const minimumMoveInOn = [listing.availableOn, localDateAfterDays(listing.timeZone, 1)].sort().at(-1) ?? listing.availableOn;
  const maximumMoveInOn = localDateAfterDays(listing.timeZone, 365);

  const availableOnLabel = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${listing.availableOn}T00:00:00Z`));
  const space = [
    listing.unitType?.replaceAll("_", " "),
    listing.bedrooms == null ? null : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}`,
    listing.bathrooms == null ? null : `${listing.bathrooms} bathroom${listing.bathrooms === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");

  return (
    <article className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      {listing.preview ? (
        <p className="mb-4 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
          Preview listing with example photos and details.
        </p>
      ) : null}
      <header className="gap-5 sm:flex sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{listing.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {location}
          </p>
        </div>
        <div className="mt-4 shrink-0 sm:mt-0 sm:text-right">
          <p className="text-2xl font-semibold tracking-tight">
            {money(listing.rentAmountMinor, listing.currencyCode)} <span className="text-sm font-normal text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Available <time dateTime={listing.availableOn}>{availableOnLabel}</time></p>
        </div>
      </header>
      <a href="#rental-actions" className={buttonVariants({ className: "mt-4 w-full sm:w-auto lg:hidden" })}>
        Contact the landlord
      </a>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(350px,0.52fr)] lg:gap-6">
        <div className="min-w-0 space-y-5">
          <RentalListingGallery photos={listing.photos.slice(0, 7)} title={listing.title} />
          <section aria-labelledby="rental-details" className="rounded-2xl border bg-card p-4 sm:p-5">
            <h2 id="rental-details" className="text-xl font-semibold tracking-tight">Rental details</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{listing.summary}</p>
            <dl className="mt-4 grid gap-x-5 gap-y-3 border-t pt-4 min-[380px]:grid-cols-2">
              <Detail icon={DoorOpen} label="Space" value={space} />
              <Detail icon={CalendarDays} label="Lease term" value={listing.leaseTermText} />
              <Detail icon={UtilityPole} label="Utilities" value={listing.utilitiesText} />
              <Detail icon={CarFront} label="Parking" value={listing.parkingText} />
              <Detail icon={PawPrint} label="Pets" value={listing.petsText} />
            </dl>
          </section>
        </div>

        <aside className="min-w-0">
          <RentalListingActions publicId={listing.publicId} timeZone={listing.timeZone}
            availableOn={minimumMoveInOn} latestMoveInOn={maximumMoveInOn} />
        </aside>
      </div>

      <p className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">
        This listing shows the rental&apos;s general location. The full address and private records stay in Crecy.
      </p>
    </article>
  );
}

function Detail({
  icon: Icon, label, value,
}: {
  icon: typeof DoorOpen; label: string; value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium first-letter:uppercase">{value || "Ask the landlord"}</dd>
      </div>
    </div>
  );
}
