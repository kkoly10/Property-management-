"use server";

import { redirect } from "next/navigation";
import { recordWorkspaceClosureAction } from "@/lib/data/organization-closure";

export async function saveWorkspaceClosureAction(form: FormData) {
  const outcome = await recordWorkspaceClosureAction(form);
  const page = "/settings/organization-closure";
  if (outcome === "mfa") redirect(`/settings/security/mfa?returnTo=${encodeURIComponent(page)}`);
  redirect(outcome === "saved" ? page : `${page}?reviewError=${outcome}`);
}
