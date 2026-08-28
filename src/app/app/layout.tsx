import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { OrganizationContextNotice } from "@/components/app/organization-context-notice";
import { getOrganizationContext } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

/**
 * The operator shell establishes the active organization ONCE, here, and every page below reads it
 * from the same context. Previously the layout resolved a workspace NAME with
 * `.from("organizations").limit(1)` and no ordering, and no organization id ever reached a page at
 * all — so each fetcher went and picked its own.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const context = await getOrganizationContext();

  // No membership at all: the operator has nothing to look at and belongs in onboarding.
  if (context.state === "none") redirect("/onboarding/organization");

  const activeLabel = context.active?.displayName
    ?? (context.state === "setup" ? "Crecy workspace" : "Select an organization");

  return (
    <AppShell
      organizationName={activeLabel}
      organizations={context.organizations}
      activeOrganizationId={context.active?.organizationId ?? null}
      switcherDisabled={context.state === "setup"}
    >
      {context.state === "active" || context.state === "setup"
        ? children
        : <OrganizationContextNotice state={context.state} organizations={context.organizations} />}
    </AppShell>
  );
}
