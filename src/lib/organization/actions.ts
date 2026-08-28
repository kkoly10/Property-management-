"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { ACTIVE_ORGANIZATION_COOKIE, normalizeOperatorOrganizations } from "@/lib/organization/context";

/**
 * Switch the operator's active organization.
 *
 * The selection is server-controlled: it is only ever written after the server has re-read the
 * caller's live memberships and found the requested one among them, and it is stored httpOnly so
 * browser script cannot set it. It is still revalidated on every use — the cookie is a preference,
 * never a grant.
 *
 * `revalidatePath("/", "layout")` is what makes "switching context refreshes all organization-scoped
 * product data" true: every cached server render below the root layout is discarded, so no page can
 * keep showing the previous tenant's rows.
 */
export async function selectOrganization(formData: FormData): Promise<void> {
  const organizationId = formData.get("organizationId");
  if (typeof organizationId !== "string" || !organizationId) return;
  if (!getPublicSupabaseConfig()) return;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_operator_organizations");
  if (error) return;
  const permitted = normalizeOperatorOrganizations(data).some((o) => o.organizationId === organizationId);
  if (!permitted) return;

  const store = await cookies();
  store.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath("/", "layout");
}

/** Forget the selection — used when the selected membership disappears. */
export async function clearOrganizationSelection(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_ORGANIZATION_COOKIE);
  revalidatePath("/", "layout");
}
