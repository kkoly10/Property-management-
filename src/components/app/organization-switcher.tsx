import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { selectOrganization } from "@/lib/organization/actions";
import type { OperatorOrganization } from "@/lib/organization/context";

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
    <div className="border-b px-5 py-4">
      <div
        className="flex w-full items-center gap-3 text-left"
        data-testid="organization-switcher"
        data-active-organization-id={activeOrganizationId ?? ""}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-subtle)] text-primary">
          <LayoutGrid aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.68rem] font-medium text-muted-foreground">Organization</span>
          <span className="mt-0.5 block truncate text-sm font-semibold tracking-[-0.01em]" data-testid="active-organization-name">
            {activeLabel}
          </span>
        </span>
        {switchable ? <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> : null}
      </div>

      {switchable ? (
        <form action={selectOrganization} className="mt-3 space-y-0.5" data-testid="organization-switcher-options">
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
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/70 ${
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{organization.displayName}</span>
                {isActive ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            );
          })}
        </form>
      ) : null}
    </div>
  );
}
