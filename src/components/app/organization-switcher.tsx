import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { selectOrganization } from "@/lib/organization/actions";
import type { OperatorOrganization } from "@/lib/organization/context";

/**
 * The operator organization switcher (spec 04 §4.1: "always displays current organization").
 *
 * A progressively-enhanced form rather than a client menu: switching is a server mutation that must
 * revalidate every organization-scoped render, so the submit belongs on the server. With one
 * organization there is nothing to switch, so it renders as a plain label.
 */
export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  activeLabel,
  disabled,
}: {
  organizations: OperatorOrganization[];
  activeOrganizationId: string | null;
  activeLabel: string;
  disabled?: boolean;
}) {
  const switchable = !disabled && organizations.length > 1;

  return (
    <div className="px-3 py-4">
      <div
        className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-xs"
        data-testid="organization-switcher"
        data-active-organization-id={activeOrganizationId ?? ""}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <LayoutGrid className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" data-testid="active-organization-name">{activeLabel}</span>
          <span className="block text-xs text-muted-foreground">Operator workspace</span>
        </span>
        {switchable ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : null}
      </div>

      {switchable ? (
        <form action={selectOrganization} className="mt-2 space-y-1" data-testid="organization-switcher-options">
          {organizations.map((organization) => {
            const isActive = organization.organizationId === activeOrganizationId;
            return (
              <button
                key={organization.organizationId}
                type="submit"
                name="organizationId"
                value={organization.organizationId}
                aria-current={isActive ? "true" : undefined}
                data-testid={`organization-option-${organization.slug || organization.organizationId}`}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{organization.displayName}</span>
                {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </form>
      ) : null}
    </div>
  );
}
