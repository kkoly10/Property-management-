"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_RECOVERY_COOKIES, passwordRecoveryCookieOptions } from "@/lib/auth/password-recovery";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/organization/context";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const store = await cookies();
  const config = getPublicSupabaseConfig();
  const hostname = config && URL.canParse(config.url) ? new URL(config.url).hostname : null;
  if (hostname) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Local browser cleanup also works during a provider outage.
    }

    // The SSR clients use the pinned SDK's project-specific default storage key. Delete only
    // this project's session, PKCE verifier, and their numbered chunks.
    const key = `sb-${hostname.split(".")[0]}-auth-token`;
    for (const { name } of store.getAll()) {
      const [base, chunk, extra] = name.split(".");
      if ((base === key || base === `${key}-code-verifier`)
        && extra === undefined && (chunk === undefined || /^\d+$/.test(chunk))) {
        store.delete(name);
      }
    }
  }
  store.delete(ACTIVE_ORGANIZATION_COOKIE);
  for (const name of PASSWORD_RECOVERY_COOKIES) {
    if (store.get(name)) store.set(name, "", { ...passwordRecoveryCookieOptions(name), maxAge: 0 });
  }
  redirect("/login");
}
