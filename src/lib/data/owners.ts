import "server-only";

import type { DataMode } from "@/lib/data/maintenance";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type OwnerEntityType = "person" | "company" | "trust" | "partnership" | "other";
export type Owner = {
  ownerEntityId: string;
  displayName: string;
  entityType: OwnerEntityType;
  email: string | null;
  phoneE164: string | null;
  status: string;
  propertyCount: number;
};
export type OwnershipInterest = {
  ownershipInterestId: string;
  propertyId: string;
  propertyName: string;
  ownershipFraction: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};
export type OwnerProperty = { propertyId: string; propertyName: string };

const previewOwners: Owner[] = [
  { ownerEntityId: "b0000000-0000-4000-8000-000000000001", displayName: "Rivera Family Trust", entityType: "trust", email: "owner@example.com", phoneE164: "+14045550111", status: "active", propertyCount: 1 },
  { ownerEntityId: "b0000000-0000-4000-8000-000000000002", displayName: "Cardinal Holdings LLC", entityType: "company", email: null, phoneE164: null, status: "active", propertyCount: 0 },
];

const entityType = (value: unknown): OwnerEntityType => {
  const candidate = String(value);
  return (["person", "company", "trust", "partnership", "other"] as const).includes(candidate as OwnerEntityType) ? candidate as OwnerEntityType : "other";
};
const nullableString = (value: unknown) => value === null || value === undefined ? null : String(value);

export async function getOperatorOwnerDirectory(organizationId: string | null): Promise<{ mode: DataMode; owners: Owner[]; requestId?: string }> {
  if (!getPublicSupabaseConfig() || !organizationId) return { mode: "setup", owners: previewOwners };
  try {
    const supabase = await createClient();
    // Scoped table reads, as this codebase does for directory pages. RLS restricts owner_entities to an
    // operator with owner.manage, and ownership_interests to the properties they can see.
    const [ownersResult, interestsResult] = await Promise.all([
      supabase.from("owner_entities").select("id,display_name,entity_type,email,phone_e164,status").eq("organization_id", organizationId).order("display_name"),
      supabase.from("ownership_interests").select("owner_entity_id,property_id").eq("organization_id", organizationId),
    ]);
    if (ownersResult.error) throw ownersResult.error;
    const propertyCount = new Map<string, Set<string>>();
    for (const row of interestsResult.data ?? []) {
      const ownerId = String(row.owner_entity_id);
      if (!propertyCount.has(ownerId)) propertyCount.set(ownerId, new Set());
      propertyCount.get(ownerId)!.add(String(row.property_id));
    }
    const owners: Owner[] = (ownersResult.data ?? []).map((row) => ({
      ownerEntityId: String(row.id),
      displayName: String(row.display_name),
      entityType: entityType(row.entity_type),
      email: nullableString(row.email),
      phoneE164: nullableString(row.phone_e164),
      status: String(row.status),
      propertyCount: propertyCount.get(String(row.id))?.size ?? 0,
    }));
    return { mode: "ready", owners };
  } catch {
    return { mode: "error", owners: [], requestId: crypto.randomUUID() };
  }
}

export async function getOperatorOwnerDetail(organizationId: string | null, ownerEntityId: string): Promise<{ mode: DataMode; owner: Owner | null; interests: OwnershipInterest[]; properties: OwnerProperty[]; requestId?: string }> {
  if (!getPublicSupabaseConfig() || !organizationId) {
    const owner = previewOwners.find((item) => item.ownerEntityId === ownerEntityId) ?? previewOwners[0];
    return { mode: "setup", owner, interests: [{ ownershipInterestId: "c0000000-0000-4000-8000-000000000001", propertyId: "d0000000-0000-4000-8000-000000000001", propertyName: "Maple Court", ownershipFraction: 1, effectiveFrom: "2026-01-01", effectiveTo: null }], properties: [{ propertyId: "d0000000-0000-4000-8000-000000000001", propertyName: "Maple Court" }] };
  }
  try {
    const supabase = await createClient();
    const [ownerResult, interestsResult, propertiesResult] = await Promise.all([
      supabase.from("owner_entities").select("id,display_name,entity_type,email,phone_e164,status").eq("organization_id", organizationId).eq("id", ownerEntityId).maybeSingle(),
      supabase.from("ownership_interests").select("id,property_id,ownership_fraction,effective_from,effective_to").eq("organization_id", organizationId).eq("owner_entity_id", ownerEntityId).order("effective_from", { ascending: false }),
      supabase.from("properties").select("id,name").eq("organization_id", organizationId).neq("status", "archived").order("name"),
    ]);
    if (ownerResult.error) throw ownerResult.error;
    if (!ownerResult.data) return { mode: "ready", owner: null, interests: [], properties: [] };
    const properties: OwnerProperty[] = (propertiesResult.data ?? []).map((row) => ({ propertyId: String(row.id), propertyName: String(row.name) }));
    const propertyName = new Map(properties.map((property) => [property.propertyId, property.propertyName]));
    const interests: OwnershipInterest[] = (interestsResult.data ?? []).map((row) => ({
      ownershipInterestId: String(row.id),
      propertyId: String(row.property_id),
      propertyName: propertyName.get(String(row.property_id)) ?? "Unknown property",
      ownershipFraction: Number(row.ownership_fraction),
      effectiveFrom: String(row.effective_from),
      effectiveTo: row.effective_to ? String(row.effective_to) : null,
    }));
    const owner: Owner = {
      ownerEntityId: String(ownerResult.data.id),
      displayName: String(ownerResult.data.display_name),
      entityType: entityType(ownerResult.data.entity_type),
      email: nullableString(ownerResult.data.email),
      phoneE164: nullableString(ownerResult.data.phone_e164),
      status: String(ownerResult.data.status),
      propertyCount: new Set(interests.map((interest) => interest.propertyId)).size,
    };
    return { mode: "ready", owner, interests, properties };
  } catch {
    return { mode: "error", owner: null, interests: [], properties: [], requestId: crypto.randomUUID() };
  }
}
