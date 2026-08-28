"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { ACTIVE_ORGANIZATION_COOKIE, normalizeOperatorOrganizations } from "@/lib/organization/context";

/**
 * Establish an organization as the active one.
 *
 * The membership check is not skippable: the selection is only written after the server re-reads the
 * caller's live memberships and finds the requested organization among them. It is still revalidated
 * on every use — the cookie is a preference, never a grant.
 *
 * Returns whether the selection was accepted, so a caller that needs to know (onboarding, which must
 * not continue into the wrong tenant) can act on the answer instead of assuming.
 */
export async function setActiveOrganization(organizationId: string): Promise<boolean> {
  if (!organizationId) return false;
  if (!getPublicSupabaseConfig()) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_operator_organizations");
  if (error) return false;
  const permitted = normalizeOperatorOrganizations(data).some((o) => o.organizationId === organizationId);
  if (!permitted) return false;

  const store = await cookies();
  store.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  // What makes "switching context refreshes all organization-scoped product data" true rather than
  // aspirational: every cached server render below the root layout is discarded.
  revalidatePath("/", "layout");
  return true;
}

/** The switcher's form target. */
export async function selectOrganization(formData: FormData): Promise<void> {
  const organizationId = formData.get("organizationId");
  if (typeof organizationId !== "string") return;
  await setActiveOrganization(organizationId);
}

/** Forget the selection — used when the selected membership disappears. */
export async function clearOrganizationSelection(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_ORGANIZATION_COOKIE);
  revalidatePath("/", "layout");
}
