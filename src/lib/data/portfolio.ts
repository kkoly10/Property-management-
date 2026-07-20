import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AccountingBookOption = {
  id: string;
  organizationId: string;
  operatingEntityId: string;
  label: string;
  currencyCode: string;
  countryCode: string;
};

export type PortfolioProperty = {
  id: string;
  organizationId: string;
  accountingBookId: string;
  name: string;
  propertyType: string;
  countryCode: string;
  subdivisionCode: string | null;
  locality: string | null;
  addressLine1: string;
  postalCode: string | null;
  timeZone: string;
  status: string;
  bookName: string;
  currencyCode: string;
  unitCount: number;
};

export async function getPropertySetupOptions(): Promise<{ mode: "setup" | "ready"; books: AccountingBookOption[] }> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      books: [{
        id: "10000000-0000-4000-8000-000000000001",
        organizationId: "20000000-0000-4000-8000-000000000002",
        operatingEntityId: "30000000-0000-4000-8000-000000000003",
        label: "Northstar PM · Virginia operating book",
        currencyCode: "USD",
        countryCode: "US",
      }],
    };
  }

  const supabase = await createClient();
  const [{ data: books }, { data: entities }] = await Promise.all([
    supabase.from("accounting_books").select("id,organization_id,operating_entity_id,name,functional_currency_code").eq("status", "open"),
    supabase.from("operating_entities").select("id,display_name,country_code"),
  ]);
  const entityById = new Map((entities ?? []).map((entity) => [entity.id, entity]));

  return {
    mode: "ready",
    books: (books ?? []).map((book) => {
      const entity = entityById.get(book.operating_entity_id);
      return {
        id: book.id,
        organizationId: book.organization_id,
        operatingEntityId: book.operating_entity_id,
        label: `${entity?.display_name ?? "Operating entity"} · ${book.name}`,
        currencyCode: book.functional_currency_code,
        countryCode: entity?.country_code ?? "US",
      };
    }),
  };
}

export async function getPortfolioState(): Promise<{ mode: "setup" | "ready" | "error"; properties: PortfolioProperty[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", properties: [] };

  try {
    const supabase = await createClient();
    const [{ data: properties, error: propertyError }, { data: books }, { data: units }] = await Promise.all([
      supabase.from("properties").select("id,organization_id,accounting_book_id,name,property_type,country_code,subdivision_code,locality,address_line1,postal_code,time_zone,status").order("name"),
      supabase.from("accounting_books").select("id,name,functional_currency_code"),
      supabase.from("units").select("property_id,operational_status"),
    ]);
    if (propertyError) throw propertyError;

    const bookById = new Map((books ?? []).map((book) => [book.id, book]));
    const unitsByProperty = new Map<string, number>();
    for (const unit of units ?? []) {
      if (unit.operational_status !== "retired") unitsByProperty.set(unit.property_id, (unitsByProperty.get(unit.property_id) ?? 0) + 1);
    }

    return {
      mode: "ready",
      properties: (properties ?? []).map((property) => {
        const book = bookById.get(property.accounting_book_id);
        return {
          id: property.id,
          organizationId: property.organization_id,
          accountingBookId: property.accounting_book_id,
          name: property.name,
          propertyType: property.property_type,
          countryCode: property.country_code,
          subdivisionCode: property.subdivision_code,
          locality: property.locality,
          addressLine1: property.address_line1,
          postalCode: property.postal_code,
          timeZone: property.time_zone,
          status: property.status,
          bookName: book?.name ?? "Accounting book",
          currencyCode: book?.functional_currency_code ?? "—",
          unitCount: unitsByProperty.get(property.id) ?? 0,
        };
      }),
    };
  } catch {
    return { mode: "error", properties: [], requestId: crypto.randomUUID() };
  }
}

export async function getPropertyWorkspace(propertyId: string): Promise<{
  mode: "setup" | "ready" | "error";
  property: PortfolioProperty | null;
  units: Array<{ id: string; unitCode: string; unitType: string | null; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; status: string }>;
  requestId?: string;
}> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      property: {
        id: propertyId,
        organizationId: "20000000-0000-4000-8000-000000000002",
        accountingBookId: "10000000-0000-4000-8000-000000000001",
        name: "Maple Court",
        propertyType: "multifamily",
        countryCode: "US",
        subdivisionCode: "VA",
        locality: "Richmond",
        addressLine1: "100 Maple Street",
        postalCode: "23220",
        timeZone: "America/New_York",
        status: "draft",
        bookName: "Virginia operating book",
        currencyCode: "USD",
        unitCount: 2,
      },
      units: [
        { id: "preview-101", unitCode: "101", unitType: "Apartment", bedrooms: 2, bathrooms: 1, squareFeet: 850, status: "active" },
        { id: "preview-102", unitCode: "102", unitType: "Apartment", bedrooms: 1, bathrooms: 1, squareFeet: 650, status: "active" },
      ],
    };
  }

  try {
    const supabase = await createClient();
    const { data: property, error } = await supabase
      .from("properties")
      .select("id,organization_id,accounting_book_id,name,property_type,country_code,subdivision_code,locality,address_line1,postal_code,time_zone,status")
      .eq("id", propertyId)
      .maybeSingle();
    if (error) throw error;
    if (!property) return { mode: "ready", property: null, units: [] };

    const [{ data: book }, { data: units, error: unitError }] = await Promise.all([
      supabase.from("accounting_books").select("name,functional_currency_code").eq("id", property.accounting_book_id).maybeSingle(),
      supabase.from("units").select("id,unit_code,unit_type,bedrooms,bathrooms,square_feet,operational_status").eq("property_id", propertyId).order("unit_code"),
    ]);
    if (unitError) throw unitError;

    return {
      mode: "ready",
      property: {
        id: property.id,
        organizationId: property.organization_id,
        accountingBookId: property.accounting_book_id,
        name: property.name,
        propertyType: property.property_type,
        countryCode: property.country_code,
        subdivisionCode: property.subdivision_code,
        locality: property.locality,
        addressLine1: property.address_line1,
        postalCode: property.postal_code,
        timeZone: property.time_zone,
        status: property.status,
        bookName: book?.name ?? "Accounting book",
        currencyCode: book?.functional_currency_code ?? "—",
        unitCount: units?.filter((unit) => unit.operational_status !== "retired").length ?? 0,
      },
      units: (units ?? []).map((unit) => ({
        id: unit.id,
        unitCode: unit.unit_code,
        unitType: unit.unit_type,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        squareFeet: unit.square_feet,
        status: unit.operational_status,
      })),
    };
  } catch {
    return { mode: "error", property: null, units: [], requestId: crypto.randomUUID() };
  }
}
