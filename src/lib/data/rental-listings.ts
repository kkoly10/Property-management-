import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";

export const PREVIEW_PUBLIC_LISTING_ID = "81000000-0000-4000-8000-000000000081";

export type RentalListingRow = {
  id: string; public_id: string; organization_id: string; property_id: string; unit_id: string;
  title: string; summary: string; rent_amount_minor: number; currency_code: string; available_on: string;
  lease_term_text: string; pets_text: string; utilities_text: string; parking_text: string;
  status: "draft" | "published" | "paused" | "closed"; visibility: "unlisted" | "discoverable";
  version: number; published_at: string | null;
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
      .select("id,public_id,organization_id,property_id,unit_id,title,summary,rent_amount_minor,currency_code,available_on,lease_term_text,pets_text,utilities_text,parking_text,status,visibility,version,published_at")
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
  publishedAt: string | null; preview: boolean;
  photos: { url: string | null; altText: string; mimeType: string }[];
};
type PublicListingRpc = Omit<PublicRentalListing, "photos" | "preview"> & {
  visibility: "unlisted";
  photos: { storageBucket: string; storagePath: string; mimeType: string; altText: string }[];
};

export async function getPublicRentalListing(publicId: string): Promise<PublicRentalListing | null> {
  if (!getPublicSupabaseConfig()) {
    if (publicId !== PREVIEW_PUBLIC_LISTING_ID) return null;
    return {
      publicId, title: "Private basement apartment", summary: "A representative share-link preview for a self-managed rental with a private entrance and driveway parking.",
      rentAmountMinor: 135000, currencyCode: "USD", availableOn: "2026-10-01", unitType: "basement",
      bedrooms: 1, bathrooms: 1, timeZone: "America/New_York",
      location: { locality: "Example City", subdivisionCode: "VA", countryCode: "US" },
      leaseTermText: "12-month lease preferred", petsText: "Ask about pets",
      utilitiesText: "Water included; other utilities follow the rental agreement.", parkingText: "One driveway space.",
      publishedAt: "2026-09-26T00:00:00Z", preview: true,
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
      parkingText: raw.parkingText, publishedAt: raw.publishedAt, preview: false, photos,
    };
  } catch {
    return null;
  }
}
