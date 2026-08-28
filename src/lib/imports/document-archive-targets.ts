import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManifestIssue, ManifestRow } from "./document-archive";

/**
 * Resolves each manifest row to the entity its document will hang off.
 *
 * Resolution runs through the CALLER's client, never a service-role one, so row-level security is the
 * authorization boundary: a property the operator cannot see simply does not resolve, and the row is
 * reported as not found rather than silently attaching a document to another tenant's entity.
 */
export type ResolvedTarget = {
  parentType: "organization" | "property" | "unit";
  parentId: string;
  propertyId: string | null;
  unitId: string | null;
};

export async function resolveManifestTargets(
  supabase: SupabaseClient,
  organizationId: string,
  rows: ManifestRow[],
): Promise<{ resolved: Map<number, ResolvedTarget>; issues: ManifestIssue[] }> {
  const resolved = new Map<number, ResolvedTarget>();
  const issues: ManifestIssue[] = [];

  const organizationRows = rows.filter((row) => row.targetType === "organization");
  for (const row of organizationRows) {
    resolved.set(row.rowNumber, { parentType: "organization", parentId: organizationId, propertyId: null, unitId: null });
  }

  const scopedRows = rows.filter((row) => row.targetType !== "organization");
  if (scopedRows.length === 0) return { resolved, issues };

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("id,name,address_line1,locality,country_code")
    .eq("organization_id", organizationId);
  if (propertyError) throw propertyError;

  const propertyKey = (name: string, address: string, locality: string, country: string) =>
    `${name.trim().toLowerCase()}|${address.trim().toLowerCase()}|${(locality ?? "").trim().toLowerCase()}|${country.trim().toUpperCase()}`;
  const propertyByKey = new Map(
    (properties ?? []).map((property) => [
      propertyKey(property.name ?? "", property.address_line1 ?? "", property.locality ?? "", property.country_code ?? ""),
      property.id as string,
    ]),
  );

  const propertyIds = new Set<string>();
  const rowProperty = new Map<number, string>();
  for (const row of scopedRows) {
    const id = propertyByKey.get(propertyKey(row.propertyName, row.addressLine1, row.locality, row.countryCode));
    if (!id) {
      issues.push({ row: row.rowNumber, field: "propertyName", code: "PROPERTY_NOT_FOUND", message: "No property in this organization matches that name and address." });
      continue;
    }
    rowProperty.set(row.rowNumber, id);
    propertyIds.add(id);
  }
  if (propertyIds.size === 0) return { resolved, issues };

  const { data: units, error: unitError } = await supabase
    .from("units")
    .select("id,property_id,unit_code")
    .in("property_id", [...propertyIds]);
  if (unitError) throw unitError;
  const unitByKey = new Map(
    (units ?? []).map((unit) => [`${unit.property_id}|${(unit.unit_code ?? "").toLowerCase()}`, unit.id as string]),
  );

  for (const row of scopedRows) {
    const propertyId = rowProperty.get(row.rowNumber);
    if (!propertyId) continue;
    if (row.targetType === "property") {
      resolved.set(row.rowNumber, { parentType: "property", parentId: propertyId, propertyId, unitId: null });
      continue;
    }
    const unitId = unitByKey.get(`${propertyId}|${row.unitCode.toLowerCase()}`);
    if (!unitId) {
      issues.push({ row: row.rowNumber, field: "unitCode", code: "UNIT_NOT_FOUND", message: "That property has no unit with this code." });
      continue;
    }
    // A tenancy-targeted document still hangs off the unit: documents carry property/unit, and the
    // unit is what makes it visible to the household living there.
    resolved.set(row.rowNumber, { parentType: "unit", parentId: unitId, propertyId, unitId });
  }

  return { resolved, issues };
}
