import { CircleAlert } from "lucide-react";
import { selectOrganization } from "@/lib/organization/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { OperatorOrganization } from "@/lib/organization/context";

/**
 * Shown instead of product data whenever there is no valid organization context.
 *
 * This screen exists so the product never has to guess. An operator whose selected organization
 * disappeared is told so and asked to choose again — they are NOT quietly moved into a different
 * tenant's dashboard, residents and ledger, which is what a "helpful" fallback would do.
 */
export function OrganizationContextNotice({
  state,
  organizations,
}: {
  state: "unselected" | "revoked" | "error";
  organizations: OperatorOrganization[];
}) {
  if (state === "error") {
    return (
      <Alert variant="destructive" data-testid="organization-context-error">
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>Your organizations could not be loaded</AlertTitle>
        <AlertDescription>Reload the page. If this continues, your session may have expired — sign in again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4" data-testid={`organization-context-${state}`}>
      {state === "revoked" ? (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>That organization is no longer available to you</AlertTitle>
          <AlertDescription>
            Your access was revoked or has expired. Choose another organization to continue — nothing has been
            selected for you.
          </AlertDescription>
        </Alert>
      ) : (
        <div>
          <h1 className="text-xl font-semibold">Choose an organization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You have access to more than one. Everything you see next belongs to the one you pick.
          </p>
        </div>
      )}

      <form action={selectOrganization} className="space-y-2">
        {organizations.map((organization) => (
          <Button
            key={organization.organizationId}
            type="submit"
            name="organizationId"
            value={organization.organizationId}
            variant="outline"
            className="w-full justify-start"
            data-testid={`organization-choice-${organization.slug || organization.organizationId}`}
          >
            {organization.displayName}
          </Button>
        ))}
      </form>
    </div>
  );
}
