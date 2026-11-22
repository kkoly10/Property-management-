import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Home, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { searchPublicRentalListings } from "@/lib/data/rental-listings";
import { exactMoneyMinor } from "@/lib/validation/homeowner-lease";
import { rentalDiscoverySearchSchema } from "@/lib/validation/rental-listing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Find rentals · Crecy",
  description: "Browse rental listings that landlords have explicitly added to Crecy discovery.",
  robots: { index: false, follow: true, noarchive: true },
};

type SearchParams = Record<string, string | string[] | undefined>;
function one(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
}
function optionalMoney(value: string) {
  if (!value) return undefined;
  return exactMoneyMinor(value) ?? Number.NaN;
}

function locationText(item: { locality: string | null; subdivisionCode: string | null; countryCode: string }) {
  return [item.locality, item.subdivisionCode, item.countryCode].filter(Boolean).join(", ");
}
function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: currencyCode, maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export default async function RentalSearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const minBedroomsRaw = one(raw, "minBedrooms");
  const parsed = rentalDiscoverySearchSchema.safeParse({
    country: one(raw, "country") || undefined,
    subdivision: one(raw, "subdivision") || undefined,
    locality: one(raw, "locality") || undefined,
    minRentMinor: optionalMoney(one(raw, "minRent")),
    maxRentMinor: optionalMoney(one(raw, "maxRent")),
    minBedrooms: minBedroomsRaw ? Number(minBedroomsRaw) : undefined,
    unitType: one(raw, "unitType") || undefined,
    availableBy: one(raw, "availableBy") || undefined,
    afterDiscoveredAt: one(raw, "afterDiscoveredAt") || undefined,
    afterId: one(raw, "afterId") || undefined,
    limit: 12,
  });
  const result = parsed.success
    ? await searchPublicRentalListings(parsed.data)
    : { items: [], nextCursor: null };

  const preserved = new URLSearchParams();
  for (const key of ["country","subdivision","locality","minRent","maxRent","minBedrooms","unitType","availableBy"]) {
    const value = one(raw, key);
    if (value) preserved.set(key, value);
  }
  if (result.nextCursor) {
    preserved.set("afterDiscoveredAt", result.nextCursor.discoveredAt);
    preserved.set("afterId", result.nextCursor.id);
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Rentals on Crecy</p>
        <h1 className="mt-3 text-[clamp(2.6rem,5vw,5rem)] font-normal leading-[0.95] tracking-[-0.06em] text-balance">
          Find a rental. Continue the relationship in one place.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          These listings were explicitly added to Crecy discovery by their landlords.
          Questions, tours and applications continue through the same listing workflow.
        </p>
      </header>

      <form method="get" action="/search" role="search" className="mt-10 rounded-2xl border bg-white p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="search-country">Country</Label>
            <NativeSelect id="search-country" name="country" className="mt-2" defaultValue={one(raw, "country")}>
              <option value="">Any country</option>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="MX">Mexico</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="search-region">State / province</Label>
            <Input id="search-region" name="subdivision" className="mt-2" maxLength={100}
              defaultValue={one(raw, "subdivision")} placeholder="VA" />
          </div>
          <div>
            <Label htmlFor="search-city">City</Label>
            <Input id="search-city" name="locality" className="mt-2" maxLength={200}
              defaultValue={one(raw, "locality")} placeholder="Fairfax" />
          </div>
          <div>
            <Label htmlFor="search-type">Space type</Label>
            <NativeSelect id="search-type" name="unitType" className="mt-2" defaultValue={one(raw, "unitType")}>
              <option value="">Any type</option>
              <option value="whole_home">Whole home</option>
              <option value="basement">Basement</option>
              <option value="room">Room</option>
              <option value="adu">ADU</option>
              <option value="apartment">Apartment</option>
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="search-min-rent">Minimum rent</Label>
            <Input id="search-min-rent" name="minRent" className="mt-2" inputMode="decimal"
              defaultValue={one(raw, "minRent")} placeholder="1000" />
          </div>
          <div>
            <Label htmlFor="search-max-rent">Maximum rent</Label>
            <Input id="search-max-rent" name="maxRent" className="mt-2" inputMode="decimal"
              defaultValue={one(raw, "maxRent")} placeholder="2500" />
          </div>
          <div>
            <Label htmlFor="search-bedrooms">Minimum bedrooms</Label>
            <Input id="search-bedrooms" name="minBedrooms" className="mt-2" type="number"
              min="0" step="0.5" defaultValue={one(raw, "minBedrooms")} placeholder="1" />
          </div>
          <div>
            <Label htmlFor="search-available">Available by</Label>
            <Input id="search-available" name="availableBy" className="mt-2" type="date"
              defaultValue={one(raw, "availableBy")} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="submit"><Search aria-hidden="true" className="h-4 w-4" />Search rentals</Button>
          <Button asChild type="button" variant="outline"><Link href="/search">Clear filters</Link></Button>
        </div>
      </form>

      {!parsed.success ? (
        <div role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Check the search filters. No rental data was queried with the invalid values.
        </div>
      ) : null}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">
              {result.items.length ? "Available rentals" : "No matching rentals"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Only landlord-approved discoverable listings appear here.
            </p>
          </div>
        </div>

        {result.items.length ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((item) => (
              <article key={item.publicId} className="overflow-hidden rounded-2xl border bg-white">
                <Link href={`/l/${item.publicId}`} className="block">
                  <div className="overflow-hidden bg-muted">
                    {item.heroPhoto?.url ? (
                      // Signed private-storage URL for the exact approved listing photo.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.heroPhoto.url}
                        alt={item.heroPhoto.altText || item.title}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
                        Photo temporarily unavailable
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold">{item.title}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                          <span className="truncate">{locationText(item.location)}</span>
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">{money(item.rentAmountMinor, item.currencyCode)}</p>
                    </div>
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Home aria-hidden="true" className="h-4 w-4" />
                        {[
                          item.unitType?.replaceAll("_", " "),
                          item.bedrooms == null ? null : `${item.bedrooms} bd`,
                          item.bathrooms == null ? null : `${item.bathrooms} ba`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays aria-hidden="true" className="h-4 w-4" />
                        Available {item.availableOn}
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
            <h3 className="font-semibold">Try a broader search</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Shareable landlord links can still exist without being included in Crecy discovery.
            </p>
          </div>
        )}

        {result.nextCursor ? (
          <div className="mt-8 flex justify-center">
            <Button asChild variant="outline">
              <Link href={`/search?${preserved.toString()}`}>More rentals</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
