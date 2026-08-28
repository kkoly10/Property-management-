import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

/**
 * The canonical active-organization context.
 *
 * Crecy's tenant is the organization and an operator may belong to several, so "which organization am
 * I looking at" is a first-class piece of request state — never something a fetcher decides for itself.
 * The rules, from file 27 §5.A3:
 *
 *   * load every organization the operator may act in;
 *   * choose automatically ONLY when exactly one exists;
 *   * when several exist, require an explicit choice and remember it server-side;
 *   * revalidate active membership every time the context is used;
 *   * NEVER fall back to another organization when the selected one becomes unavailable.
 *
 * That last rule is why `state: "revoked"` exists as its own outcome. Silently sliding an operator into
 * a different tenant because their selection disappeared is precisely the data-mixing failure this
 * whole slice removes — an operator must be told, and must choose again.
 */
export const ACTIVE_ORGANIZATION_COOKIE = "crecy_active_organization";

export type OperatorOrganization = {
  organizationId: string;
  displayName: string;
  slug: string;
  roleCode: string;
};

export type OrganizationContext =
  /** Supabase is not configured; the UI renders preview data. */
  | { state: "setup"; organizations: OperatorOrganization[]; active: null }
  /** The operator belongs to no organization yet — they belong in onboarding. */
  | { state: "none"; organizations: []; active: null }
  /** Several organizations and no valid selection: the operator must choose. */
  | { state: "unselected"; organizations: OperatorOrganization[]; active: null }
  /** A selection existed but the membership behind it is gone. Never silently replaced. */
  | { state: "revoked"; organizations: OperatorOrganization[]; active: null }
  | { state: "active"; organizations: OperatorOrganization[]; active: OperatorOrganization }
  | { state: "error"; organizations: []; active: null };

export function normalizeOperatorOrganizations(data: unknown): OperatorOrganization[] {
  const raw = (data as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const record = entry as Record<string, unknown>;
    const organizationId = typeof record.organizationId === "string" ? record.organizationId : null;
    if (!organizationId) return [];
    return [{
      organizationId,
      displayName: typeof record.displayName === "string" ? record.displayName : "Untitled organization",
      slug: typeof record.slug === "string" ? record.slug : "",
      roleCode: typeof record.roleCode === "string" ? record.roleCode : "",
    }];
  });
}

/**
 * Decide the context from the operator's real memberships and their stored selection.
 *
 * Pure so the rules are testable without a database or a request: every branch below is a product
 * decision, not an implementation detail.
 */
export function decideOrganizationContext(
  organizations: OperatorOrganization[],
  selectedId: string | null,
): OrganizationContext {
  if (organizations.length === 0) return { state: "none", organizations: [], active: null };

  const selected = selectedId ? organizations.find((o) => o.organizationId === selectedId) ?? null : null;
  if (selected) return { state: "active", organizations, active: selected };

  // A selection that no longer resolves means the membership was revoked, expired, or the cookie was
  // tampered with. Report it; do not quietly hand the operator a different tenant's data.
  if (selectedId) return { state: "revoked", organizations, active: null };

  // Automatic selection is allowed in exactly one case: there is nothing to choose between.
  if (organizations.length === 1) return { state: "active", organizations, active: organizations[0] };

  return { state: "unselected", organizations, active: null };
}

export async function getOrganizationContext(): Promise<OrganizationContext> {
  if (!getPublicSupabaseConfig()) {
    const preview: OperatorOrganization[] = [
      { organizationId: "00000000-0000-4000-8000-000000000001", displayName: "Crecy workspace", slug: "crecy-workspace", roleCode: "org_owner" },
    ];
    return { state: "setup", organizations: preview, active: null };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_operator_organizations");
    if (error) throw error;
    const organizations = normalizeOperatorOrganizations(data);
    const store = await cookies();
    return decideOrganizationContext(organizations, store.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null);
  } catch {
    return { state: "error", organizations: [], active: null };
  }
}

/**
 * The organization id for a server fetcher, or null when there is no valid context.
 *
 * Fetchers call this instead of resolving an organization themselves. Returning null (rather than
 * guessing) is what makes "no fetcher independently chooses its own organization" true in practice.
 */
export async function getActiveOrganizationId(): Promise<string | null> {
  const context = await getOrganizationContext();
  return context.state === "active" ? context.active.organizationId : null;
}
