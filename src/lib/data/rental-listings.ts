import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";
import type { RentalDiscoverySearch } from "@/lib/validation/rental-listing";

export const PREVIEW_PUBLIC_LISTING_ID = "81000000-0000-4000-8000-000000000081";
export const PREVIEW_DISCOVERABLE_LISTING_ID = "83000000-0000-4000-8000-000000000083";

export type RentalListingRow = {
  id: string; public_id: string; organization_id: string; property_id: string; unit_id: string;
  title: string; summary: string; rent_amount_minor: number; currency_code: string; available_on: string;
  lease_term_text: string; pets_text: string; utilities_text: string; parking_text: string;
  status: "draft" | "published" | "paused" | "closed"; visibility: "unlisted" | "discoverable";
  version: number; published_at: string | null; discovered_at: string | null;
};
export type ListingPhotoOption = {
  versionId: string; documentId: string; status: string; originalFilename: string; mimeType: string;
  uploadedAt: string; altText: string; sortOrder: number | null; attached: boolean;
};
export type RentalListingWorkspace = {
  mode: "setup" | "ready" | "error" | "unavailable" | "not_found";
  organizationId: string | null; unitId: string; unitName: string; currencyCode: string;
  listing: RentalListingRow | null; photos: ListingPhotoOption[];
};
export async function getRentalListingWorkspace(unitId: string): Promise<RentalListingWorkspace> {
  const rental = await getRentalWorkspace();
  const base = { organizationId: rental.organization?.organizationId ?? null, unitId, unitName: "Rental", currencyCode: "USD", listing: null, photos: [] };
  if (rental.mode === "setup") return { ...base, mode: "setup" };
  if (rental.mode === "unavailable") return { ...base, mode: "unavailable" };
  if (rental.mode === "error") return { ...base, mode: "error" };
  const unit = rental.units.find((item) => item.id === unitId);
  if (!unit || !rental.organization) return { ...base, mode: "not_found" };
  const property = rental.properties.find((item) => item.id === unit.property_id);
  if (!property) return { ...base, mode: "not_found" };

  try {
    const supabase = await createClient();
    const organizationId = rental.organization.organizationId;
    const listingResult = await supabase.from("rental_listings")
      .select("id,public_id,organization_id,property_id,unit_id,title,summary,rent_amount_minor,currency_code,available_on,lease_term_text,pets_text,utilities_text,parking_text,status,visibility,version,published_at,discovered_at")
      .eq("organization_id", organizationId).eq("unit_id", unitId).neq("status", "closed").maybeSingle();
    if (listingResult.error) return { ...base, organizationId, unitName: unit.unit_code, mode: "error" };

    const documentsResult = await supabase.from("documents")
      .select("id").eq("organization_id", organizationId).eq("unit_id", unitId)
      .eq("document_type", "rental_listing_photo").eq("status", "active");
    if (documentsResult.error) return { ...base, organizationId, unitName: unit.unit_code, mode: "error" };
    const documentIds = (documentsResult.data ?? []).map((row) => String(row.id));

    const [versionsResult, attachedResult] = await Promise.all([
      documentIds.length
        ? supabase.from("document_versions")
          .select("id,document_id,upload_status,original_filename,mime_type,uploaded_at")
          .eq("organization_id", organizationId).in("document_id", documentIds).order("uploaded_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      listingResult.data
        ? supabase.from("rental_listing_photos")
          .select("document_version_id,sort_order,alt_text")
          .eq("organization_id", organizationId).eq("listing_id", String(listingResult.data.id)).order("sort_order")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (versionsResult.error || attachedResult.error) return { ...base, organizationId, unitName: unit.unit_code, mode: "error" };

    const attached = new Map((attachedResult.data ?? []).map((row) => [
      String(row.document_version_id),
      { sortOrder: Number(row.sort_order), altText: String(row.alt_text ?? "") },
    ]));
    const photos: ListingPhotoOption[] = (versionsResult.data ?? []).map((row) => {
      const selected = attached.get(String(row.id));
      return {
        versionId: String(row.id), documentId: String(row.document_id), status: String(row.upload_status),
        originalFilename: String(row.original_filename), mimeType: String(row.mime_type),
        uploadedAt: String(row.uploaded_at), altText: selected?.altText ?? "",
        sortOrder: selected?.sortOrder ?? null, attached: Boolean(selected),
      };
    }).sort((a, b) => {
      if (a.attached && b.attached) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (a.attached) return -1; if (b.attached) return 1; return b.uploadedAt.localeCompare(a.uploadedAt);
    });
    const book = rental.books.find((item) => item.id === property.accounting_book_id);
    return {
      mode: "ready", organizationId, unitId, unitName: unit.unit_code,
      currencyCode: (listingResult.data as RentalListingRow | null)?.currency_code ?? book?.functional_currency_code ?? rental.books[0]?.functional_currency_code ?? "USD",
      listing: listingResult.data as RentalListingRow | null, photos,
    };
  } catch {
    return { ...base, organizationId: rental.organization.organizationId, unitName: unit.unit_code, mode: "error" };
  }
}

export type PublicRentalListing = {
  publicId: string; title: string; summary: string; rentAmountMinor: number; currencyCode: string;
  availableOn: string; unitType: string | null; bedrooms: number | null; bathrooms: number | null;
  timeZone: string;
  location: { locality: string | null; subdivisionCode: string | null; countryCode: string };
  leaseTermText: string; petsText: string; utilitiesText: string; parkingText: string;
  visibility: "unlisted" | "discoverable"; publishedAt: string | null; discoveredAt: string | null; preview: boolean;
  photos: { url: string | null; altText: string; mimeType: string }[];
};
type PublicListingRpc = Omit<PublicRentalListing, "photos" | "preview"> & {
  photos: { storageBucket: string; storagePath: string; mimeType: string; altText: string }[];
};

export async function getPublicRentalListing(publicId: string): Promise<PublicRentalListing | null> {
  if (!getPublicSupabaseConfig()) {
    if (publicId !== PREVIEW_PUBLIC_LISTING_ID && publicId !== PREVIEW_DISCOVERABLE_LISTING_ID) return null;
    const discoverable = publicId === PREVIEW_DISCOVERABLE_LISTING_ID;
    return {
      publicId, title: discoverable ? "Garden-level apartment" : "Private basement apartment",
      summary: "A representative rental preview for a self-managed space with a private entrance and driveway parking.",
      rentAmountMinor: 135000, currencyCode: "USD", availableOn: "2026-10-01", unitType: "basement",
      bedrooms: 1, bathrooms: 1, timeZone: "America/New_York",
      location: { locality: "Example City", subdivisionCode: "VA", countryCode: "US" },
      leaseTermText: "12-month lease preferred", petsText: "Ask about pets",
      utilitiesText: "Water included; other utilities follow the rental agreement.", parkingText: "One driveway space.",
      visibility: discoverable ? "discoverable" : "unlisted",
      publishedAt: "2026-09-26T00:00:00Z", discoveredAt: discoverable ? "2026-10-09T20:00:00Z" : null,
      preview: true,
      photos: [{ url: "/media/maple-court/model-home.webp", altText: "Representative interior preview", mimeType: "image/webp" }],
    };
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_public_rental_listing", { p_public_id: publicId });
    if (error || !data) return null;
    const raw = data as PublicListingRpc;
    const photos = await Promise.all((raw.photos ?? []).map(async (photo) => {
      const signed = await admin.storage.from(photo.storageBucket).createSignedUrl(photo.storagePath, 300);
      return { url: signed.data?.signedUrl ?? null, altText: photo.altText, mimeType: photo.mimeType };
    }));
    return {
      publicId: raw.publicId, title: raw.title, summary: raw.summary,
      rentAmountMinor: Number(raw.rentAmountMinor), currencyCode: raw.currencyCode, availableOn: raw.availableOn,
      unitType: raw.unitType ?? null, bedrooms: raw.bedrooms == null ? null : Number(raw.bedrooms),
      bathrooms: raw.bathrooms == null ? null : Number(raw.bathrooms),
      timeZone: raw.timeZone,
      location: raw.location,
      leaseTermText: raw.leaseTermText, petsText: raw.petsText, utilitiesText: raw.utilitiesText,
      parkingText: raw.parkingText, visibility: raw.visibility, publishedAt: raw.publishedAt,
      discoveredAt: raw.discoveredAt, preview: false, photos,
    };
  } catch {
    return null;
  }
}

const discoveryRpcSchema = z.object({
  items: z.array(z.object({
    publicId: z.uuid(),
    title: z.string(),
    summary: z.string(),
    rentAmountMinor: z.union([z.number(), z.string()]),
    currencyCode: z.string().length(3),
    availableOn: z.string(),
    unitType: z.string().nullable(),
    bedrooms: z.union([z.number(), z.string()]).nullable(),
    bathrooms: z.union([z.number(), z.string()]).nullable(),
    timeZone: z.string(),
    location: z.object({
      locality: z.string().nullable(),
      subdivisionCode: z.string().nullable(),
      countryCode: z.string().length(2),
    }),
    discoveredAt: z.string(),
    heroPhoto: z.object({
      storageBucket: z.string(),
      storagePath: z.string(),
      mimeType: z.string(),
      altText: z.string(),
    }).nullable(),
  })),
  nextCursor: z.object({
    discoveredAt: z.string(),
    id: z.uuid(),
  }).nullable(),
});

export type RentalDiscoveryItem = {
  publicId: string; title: string; summary: string; rentAmountMinor: number; currencyCode: string;
  availableOn: string; unitType: string | null; bedrooms: number | null; bathrooms: number | null;
  timeZone: string; location: { locality: string | null; subdivisionCode: string | null; countryCode: string };
  discoveredAt: string; heroPhoto: { url: string | null; altText: string; mimeType: string } | null;
};
export type RentalDiscoveryResult = {
  items: RentalDiscoveryItem[];
  nextCursor: { discoveredAt: string; id: string } | null;
};

export async function searchPublicRentalListings(input: RentalDiscoverySearch): Promise<RentalDiscoveryResult> {
  if (!getPublicSupabaseConfig()) {
    const preview: RentalDiscoveryItem = {
      publicId: PREVIEW_DISCOVERABLE_LISTING_ID,
      title: "Garden-level apartment",
      summary: "Private entrance, one bedroom, and driveway parking in a self-managed rental.",
      rentAmountMinor: 135000,
      currencyCode: "USD",
      availableOn: "2026-10-01",
      unitType: "basement",
      bedrooms: 1,
      bathrooms: 1,
      timeZone: "America/New_York",
      location: { locality: "Example City", subdivisionCode: "VA", countryCode: "US" },
      discoveredAt: "2026-10-09T20:00:00Z",
      heroPhoto: { url: "/media/maple-court/model-home.webp", altText: "Representative rental interior", mimeType: "image/webp" },
    };
    const matches = (!input.country || input.country === preview.location.countryCode)
      && (!input.subdivision || input.subdivision.toLowerCase() === preview.location.subdivisionCode?.toLowerCase())
      && (!input.locality || input.locality.toLowerCase() === preview.location.locality?.toLowerCase())
      && (input.minRentMinor === undefined || preview.rentAmountMinor >= input.minRentMinor)
      && (input.maxRentMinor === undefined || preview.rentAmountMinor <= input.maxRentMinor)
      && (input.minBedrooms === undefined || (preview.bedrooms ?? 0) >= input.minBedrooms)
      && (!input.unitType || input.unitType.toLowerCase() === preview.unitType?.toLowerCase())
      && (!input.availableBy || preview.availableOn <= input.availableBy);
    return { items: matches && !input.afterId ? [preview] : [], nextCursor: null };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("search_public_rental_listings", {
    p_country_code: input.country ?? null,
    p_subdivision_code: input.subdivision ?? null,
    p_locality: input.locality ?? null,
    p_min_rent_minor: input.minRentMinor ?? null,
    p_max_rent_minor: input.maxRentMinor ?? null,
    p_min_bedrooms: input.minBedrooms ?? null,
    p_unit_type: input.unitType ?? null,
    p_available_by: input.availableBy ?? null,
    p_after_discovered_at: input.afterDiscoveredAt ?? null,
    p_after_id: input.afterId ?? null,
    p_limit: input.limit,
  });
  if (error || !data) return { items: [], nextCursor: null };

  const parsed = discoveryRpcSchema.safeParse(data);
  if (!parsed.success) return { items: [], nextCursor: null };

  const items = await Promise.all(parsed.data.items.map(async (item) => {
    let heroPhoto: RentalDiscoveryItem["heroPhoto"] = null;
    if (item.heroPhoto) {
      const signed = await admin.storage.from(item.heroPhoto.storageBucket)
        .createSignedUrl(item.heroPhoto.storagePath, 300);
      heroPhoto = {
        url: signed.data?.signedUrl ?? null,
        altText: item.heroPhoto.altText,
        mimeType: item.heroPhoto.mimeType,
      };
    }
    return {
      publicId: item.publicId,
      title: item.title,
      summary: item.summary,
      rentAmountMinor: Number(item.rentAmountMinor),
      currencyCode: item.currencyCode,
      availableOn: item.availableOn,
      unitType: item.unitType,
      bedrooms: item.bedrooms == null ? null : Number(item.bedrooms),
      bathrooms: item.bathrooms == null ? null : Number(item.bathrooms),
      timeZone: item.timeZone,
      location: item.location,
      discoveredAt: item.discoveredAt,
      heroPhoto,
    };
  }));
  return { items, nextCursor: parsed.data.nextCursor };
}
