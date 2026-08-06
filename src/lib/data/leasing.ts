import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type LeasePropertyOption = {
  id: string;
  organizationId: string;
  name: string;
  currencyCode: "USD" | "CAD" | "MXN";
};

export type LeaseUnitOption = { id: string; propertyId: string; unitCode: string };
export type SignedLeaseDocumentOption = { id: string; propertyId: string; unitId: string | null; title: string; filename: string };

export async function getExistingLeaseOptions(): Promise<{
  mode: "setup" | "ready" | "error";
  properties: LeasePropertyOption[];
  units: LeaseUnitOption[];
  documents: SignedLeaseDocumentOption[];
  requestId?: string;
}> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      properties: [{ id: "10000000-0000-4000-8000-000000000001", organizationId: "20000000-0000-4000-8000-000000000002", name: "Maple Court", currencyCode: "USD" }],
      units: [
        { id: "30000000-0000-4000-8000-000000000003", propertyId: "10000000-0000-4000-8000-000000000001", unitCode: "101" },
        { id: "40000000-0000-4000-8000-000000000004", propertyId: "10000000-0000-4000-8000-000000000001", unitCode: "102" },
      ],
      documents: [{ id: "50000000-0000-4000-8000-000000000005", propertyId: "10000000-0000-4000-8000-000000000001", unitId: "30000000-0000-4000-8000-000000000003", title: "Unit 101 signed lease", filename: "lease-101.pdf" }],
    };
  }

  try {
    const supabase = await createClient();
    const [{ data: properties, error: propertyError }, { data: units, error: unitError }, { data: books }, { data: documents, error: documentError }, { data: versions }] = await Promise.all([
      supabase.from("properties").select("id,organization_id,accounting_book_id,name").neq("status", "archived").order("name"),
      supabase.from("units").select("id,property_id,unit_code").eq("operational_status", "active").order("unit_code"),
      supabase.from("accounting_books").select("id,functional_currency_code"),
      supabase.from("documents").select("id,property_id,unit_id,title,tenancy_id").in("document_type", ["signed_lease", "lease"]).eq("status", "active").is("tenancy_id", null),
      supabase.from("document_versions").select("document_id,original_filename,version_number").eq("upload_status", "clean").order("version_number", { ascending: false }),
    ]);
    if (propertyError || unitError || documentError) throw propertyError ?? unitError ?? documentError;
    const bookById = new Map((books ?? []).map((book) => [book.id, book.functional_currency_code]));
    const latestFilename = new Map<string, string>();
    for (const version of versions ?? []) if (!latestFilename.has(version.document_id)) latestFilename.set(version.document_id, version.original_filename);
    const availableDocuments = (documents ?? []).filter((document) => document.property_id && latestFilename.has(document.id));
    return {
      mode: "ready",
      properties: (properties ?? []).flatMap((property) => {
        const currency = bookById.get(property.accounting_book_id);
        if (currency !== "USD" && currency !== "CAD" && currency !== "MXN") return [];
        return [{ id: property.id, organizationId: property.organization_id, name: property.name, currencyCode: currency }];
      }),
      units: (units ?? []).map((unit) => ({ id: unit.id, propertyId: unit.property_id, unitCode: unit.unit_code })),
      documents: availableDocuments.map((document) => ({ id: document.id, propertyId: document.property_id!, unitId: document.unit_id, title: document.title, filename: latestFilename.get(document.id)! })),
    };
  } catch {
    return { mode: "error", properties: [], units: [], documents: [], requestId: crypto.randomUUID() };
  }
}

export type ResidentDirectoryRow = {
  personId: string;
  organizationId: string;
  name: string;
  email: string | null;
  phoneE164: string | null;
  householdName: string;
  propertyName: string;
  unitCode: string;
  tenancyStatus: string;
  leaseStart: string;
  leaseEnd: string | null;
  rentAmountMinor: number;
  currencyCode: string;
  invitationState: "active" | "invited" | "not_invited";
};

export async function getResidentDirectory(): Promise<{ mode: "setup" | "ready" | "error"; residents: ResidentDirectoryRow[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return {
    mode: "setup",
    residents: [{ personId: "preview-resident", organizationId: "20000000-0000-4000-8000-000000000002", name: "Jordan Rivera", email: "jordan@example.com", phoneE164: "+1 202 555 0110", householdName: "Rivera household", propertyName: "Maple Court", unitCode: "101", tenancyStatus: "active", leaseStart: "2026-01-01", leaseEnd: "2026-12-31", rentAmountMinor: 185000, currencyCode: "USD", invitationState: "not_invited" }],
  };
  try {
    const supabase = await createClient();
    const [{ data: people, error: peopleError }, { data: members }, { data: households }, { data: tenancies }, { data: leases }, { data: properties }, { data: units }, { data: relationships }] = await Promise.all([
      supabase.from("people").select("id,organization_id,first_name,last_name,email,phone_e164").is("archived_at", null),
      supabase.from("household_members").select("household_id,person_id,ends_on"),
      supabase.from("households").select("id,display_name"),
      supabase.from("tenancies").select("id,property_id,unit_id,household_id,lease_id,status").in("status", ["scheduled", "active", "notice_given", "move_out_in_progress"]),
      supabase.from("leases").select("id,start_date,end_date,rent_amount_minor,currency_code"),
      supabase.from("properties").select("id,name"),
      supabase.from("units").select("id,unit_code"),
      supabase.from("user_relationships").select("relationship_id,status").eq("relationship_type", "resident_person").in("status", ["active", "invited"]),
    ]);
    if (peopleError) throw peopleError;
    const householdById = new Map((households ?? []).map((household) => [household.id, household]));
    const tenancyByHousehold = new Map((tenancies ?? []).map((tenancy) => [tenancy.household_id, tenancy]));
    const leaseById = new Map((leases ?? []).map((lease) => [lease.id, lease]));
    const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
    const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.unit_code]));
    const relationshipState = new Map<string, string>();
    for (const relationship of relationships ?? []) {
      if (relationship.status === "active" || !relationshipState.has(relationship.relationship_id)) relationshipState.set(relationship.relationship_id, relationship.status);
    }
    const personById = new Map((people ?? []).map((person) => [person.id, person]));
    const residents: ResidentDirectoryRow[] = [];
    for (const member of members ?? []) {
      if (member.ends_on) continue;
      const person = personById.get(member.person_id);
      const household = householdById.get(member.household_id);
      const tenancy = tenancyByHousehold.get(member.household_id);
      const lease = tenancy ? leaseById.get(tenancy.lease_id) : undefined;
      if (!person || !household || !tenancy || !lease) continue;
      const relationship = relationshipState.get(person.id);
      residents.push({
        personId: person.id,
        organizationId: person.organization_id,
        name: `${person.first_name} ${person.last_name}`,
        email: person.email,
        phoneE164: person.phone_e164,
        householdName: household.display_name,
        propertyName: propertyById.get(tenancy.property_id) ?? "Property",
        unitCode: unitById.get(tenancy.unit_id) ?? "—",
        tenancyStatus: tenancy.status,
        leaseStart: lease.start_date,
        leaseEnd: lease.end_date,
        rentAmountMinor: Number(lease.rent_amount_minor),
        currencyCode: lease.currency_code,
        invitationState: relationship === "active" ? "active" : relationship === "invited" ? "invited" : "not_invited",
      });
    }
    residents.sort((a, b) => a.name.localeCompare(b.name));
    return { mode: "ready", residents };
  } catch {
    return { mode: "error", residents: [], requestId: crypto.randomUUID() };
  }
}
