import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";

export type RentalTourPreference = {
  position: number;
  localStart: string;
  startsAt: string;
  endsAt: string;
};

export type RentalTourItem = {
  id: string;
  publicReference: string;
  listingId: string;
  unitId: string;
  firstName: string;
  lastName: string;
  email: string;
  propertyTimeZone: string;
  status: "requested" | "confirmed";
  verifiedAt: string;
  confirmedPreferencePosition: number | null;
  confirmedStartAt: string | null;
  confirmedMeetingLocation: string | null;
  createdAt: string;
  version: number;
  preferences: RentalTourPreference[];
};

export type RentalTourWorkspace = {
  mode: "setup" | "ready" | "error" | "unavailable" | "not_found";
  organizationId: string | null;
  unitId: string;
  unitName: string;
  meetingLocationDefault: string;
  items: RentalTourItem[];
};

const PREVIEW_UNIT = "80000000-0000-4000-8000-000000000008";

function previewItem(): RentalTourItem {
  return {
    id: "9a000000-0000-4000-8000-00000000009a",
    publicReference: "TOUR-DEMO123456",
    listingId: "99000000-0000-4000-8000-000000000099",
    unitId: PREVIEW_UNIT,
    firstName: "Jamie",
    lastName: "Visitor",
    email: "jamie.visitor@example.com",
    propertyTimeZone: "America/New_York",
    status: "requested",
    verifiedAt: "2026-10-07T12:00:00Z",
    confirmedPreferencePosition: null,
    confirmedStartAt: null,
    confirmedMeetingLocation: null,
    createdAt: "2026-10-07T11:55:00Z",
    version: 2,
    preferences: [
      { position: 0, localStart: "2026-10-10T18:00:00", startsAt: "2026-10-10T22:00:00Z", endsAt: "2026-10-10T22:30:00Z" },
      { position: 1, localStart: "2026-10-12T10:00:00", startsAt: "2026-10-12T14:00:00Z", endsAt: "2026-10-12T14:30:00Z" },
    ],
  };
}

export async function getRentalTourWorkspace(unitId: string): Promise<RentalTourWorkspace> {
  const rental = await getRentalWorkspace();
  const base = {
    organizationId: rental.organization?.organizationId ?? null,
    unitId,
    unitName: "Rental",
    meetingLocationDefault: "",
    items: [] as RentalTourItem[],
  };
  if (rental.mode === "setup") {
    return {
      ...base,
      mode: "setup",
      unitName: "Sample basement apartment",
      meetingLocationDefault: "123 Example Street, Example City, VA 22000",
      items: unitId === PREVIEW_UNIT ? [previewItem()] : [],
    };
  }
  if (rental.mode === "unavailable") return { ...base, mode: "unavailable" };
  if (rental.mode === "error") return { ...base, mode: "error" };
  const unit = rental.units.find((item) => item.id === unitId);
  if (!unit || !rental.organization) return { ...base, mode: "not_found" };
  const property = rental.properties.find((item) => item.id === unit.property_id);
  if (!property) return { ...base, mode: "not_found" };
  const meetingLocationDefault = [
    property.address_line1,
    [property.locality, property.subdivision_code].filter(Boolean).join(", "),
    property.postal_code,
  ].filter(Boolean).join(" ");

  try {
    const supabase = await createClient();
    const organizationId = rental.organization.organizationId;
    const toursResult = await supabase.from("rental_tour_requests")
      .select("id,public_reference,listing_id,unit_id,first_name,last_name,email,property_time_zone,status,verified_at,confirmed_preference_position,confirmed_start_at,confirmed_meeting_location,created_at,version")
      .eq("organization_id", organizationId)
      .eq("unit_id", unitId)
      .in("status", ["requested", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (toursResult.error) {
      return { ...base, organizationId, unitName: unit.unit_code, mode: "error" };
    }
    const rows = toursResult.data ?? [];
    const tourIds = rows.map((row) => String(row.id));
    const prefsResult = tourIds.length
      ? await supabase.from("rental_tour_preferences")
        .select("tour_request_id,position,local_start,starts_at,ends_at")
        .eq("organization_id", organizationId)
        .in("tour_request_id", tourIds)
        .order("position")
      : { data: [], error: null };
    if (prefsResult.error) {
      return { ...base, organizationId, unitName: unit.unit_code, mode: "error" };
    }

    const preferences = new Map<string, RentalTourPreference[]>();
    for (const row of prefsResult.data ?? []) {
      const id = String(row.tour_request_id);
      const list = preferences.get(id) ?? [];
      list.push({
        position: Number(row.position),
        localStart: String(row.local_start),
        startsAt: String(row.starts_at),
        endsAt: String(row.ends_at),
      });
      preferences.set(id, list);
    }

    return {
      mode: "ready",
      organizationId,
      unitId,
      unitName: unit.unit_code,
      meetingLocationDefault,
      items: rows.map((row) => ({
        id: String(row.id),
        publicReference: String(row.public_reference),
        listingId: String(row.listing_id),
        unitId: String(row.unit_id),
        firstName: String(row.first_name),
        lastName: String(row.last_name),
        email: String(row.email),
        propertyTimeZone: String(row.property_time_zone),
        status: row.status === "confirmed" ? "confirmed" : "requested",
        verifiedAt: String(row.verified_at),
        confirmedPreferencePosition: row.confirmed_preference_position == null ? null : Number(row.confirmed_preference_position),
        confirmedStartAt: row.confirmed_start_at == null ? null : String(row.confirmed_start_at),
        confirmedMeetingLocation: row.confirmed_meeting_location == null ? null : String(row.confirmed_meeting_location),
        createdAt: String(row.created_at),
        version: Number(row.version),
        preferences: preferences.get(String(row.id)) ?? [],
      })),
    };
  } catch {
    return {
      ...base,
      organizationId: rental.organization.organizationId,
      unitName: unit.unit_code,
      meetingLocationDefault,
      mode: "error",
    };
  }
}
