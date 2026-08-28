import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { OPERATOR_SEARCH_LIMIT } from "@/lib/validation/search";

export type OperatorSearchKind =
  | "property"
  | "unit"
  | "resident"
  | "lease"
  | "payment"
  | "maintenance_request"
  | "work_order"
  | "document"
  | "owner_entity";

export type OperatorSearchItem = {
  kind: OperatorSearchKind;
  resourceId: string;
  title: string;
  subtitle: string;
  status: string;
  propertyId: string | null;
  propertyName: string | null;
  href: string;
};

export type OperatorSearchState = {
  mode: "ready" | "setup" | "error";
  query: string;
  items: OperatorSearchItem[];
  requestId?: string;
};

const kinds = new Set<OperatorSearchKind>([
  "property",
  "unit",
  "resident",
  "lease",
  "payment",
  "maintenance_request",
  "work_order",
  "document",
  "owner_entity",
]);

const allowedHrefPrefixes: Record<OperatorSearchKind, string[]> = {
  property: ["/app/properties/"],
  unit: ["/app/properties/"],
  resident: ["/app/residents?"],
  lease: ["/app/properties/"],
  payment: ["/app/payments/"],
  maintenance_request: ["/app/maintenance/"],
  work_order: ["/app/maintenance/"],
  document: ["/app/documents?"],
  owner_entity: ["/app/owner-statements/"],
};

function normalizeItems(value: unknown): OperatorSearchItem[] {
  const root = value as Record<string, unknown> | null;
  const items = Array.isArray(root?.items) ? root.items : [];

  return items.slice(0, OPERATOR_SEARCH_LIMIT).flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const kind = item.kind as OperatorSearchKind;
    const href = String(item.href ?? "");
    if (!kinds.has(kind) || !allowedHrefPrefixes[kind].some((prefix) => href.startsWith(prefix))) return [];
    return [{
      kind,
      resourceId: String(item.resourceId ?? ""),
      title: String(item.title ?? ""),
      subtitle: String(item.subtitle ?? ""),
      status: String(item.status ?? ""),
      propertyId: item.propertyId == null ? null : String(item.propertyId),
      propertyName: item.propertyName == null ? null : String(item.propertyName),
      href,
    }];
  });
}

export async function searchOperatorWorkspace(organizationId: string | null, query: string): Promise<OperatorSearchState> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", query, items: [] };
  if (!organizationId) return { mode: "error", query, items: [] };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_global_search", {
      p_organization_id: organizationId,
      p_query: query,
      p_limit: OPERATOR_SEARCH_LIMIT,
    });
    if (error || !data) throw error ?? new Error("Search is unavailable.");
    return { mode: "ready", query, items: normalizeItems(data) };
  } catch {
    return { mode: "error", query, items: [], requestId: crypto.randomUUID() };
  }
}
