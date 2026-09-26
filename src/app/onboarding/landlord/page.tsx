import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, House, Plus } from "lucide-react";
import { selectOrganization } from "@/lib/organization/actions";
import { getOrganizationContext } from "@/lib/organization/context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function LandlordEntryPage() {
  const context = await getOrganizationContext();

  if (context.state === "none") redirect("/onboarding/organization?path=self_managing");
  if (context.state === "active" && context.active.customerPath === "self_managing") {
    redirect("/app/rentals");
  }

  const selfManaged = context.organizations.filter((organization) => organization.customerPath === "self_managing");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-subtle)] text-primary">
          <House aria-hidden="true" className="h-5 w-5" />
        </span>
        <p className="mt-5 text-sm font-semibold text-primary">Rent out your own place</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Continue to your rental workspace</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Crecy keeps a self-managed rental separate from any professional property-management workspace
          you also use. Choose the rental workspace you want, or create one.
        </p>
      </div>

      {context.state === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Your workspaces could not be loaded</AlertTitle>
          <AlertDescription>Reload this page or sign in again before continuing.</AlertDescription>
        </Alert>
      ) : null}

      {context.state === "revoked" ? (
        <Alert variant="destructive">
          <AlertTitle>Your previous workspace is no longer available</AlertTitle>
          <AlertDescription>
            Crecy will not silently switch you into another organization. Choose a self-managed rental
            workspace below, or create a new one.
          </AlertDescription>
        </Alert>
      ) : null}

      {context.state === "setup" ? (
        <Alert variant="info">
          <AlertTitle>Landlord entry preview</AlertTitle>
          <AlertDescription>
            Connect Supabase and sign in to choose or create a self-managed rental workspace.
          </AlertDescription>
        </Alert>
      ) : null}

      {selfManaged.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Your rental workspaces</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Selecting one changes only the active workspace. It does not merge data or permissions.
            </p>
          </div>
          <form action={selectOrganization} className="grid gap-3">
            {selfManaged.map((organization) => (
              <Button
                key={organization.organizationId}
                type="submit"
                name="organizationId"
                value={organization.organizationId}
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-4 text-left"
              >
                <Building2 aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{organization.displayName}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Self-managing rental workspace
                  </span>
                </span>
              </Button>
            ))}
          </form>
        </section>
      ) : null}      {context.state !== "error" ? (
        <section className="border-t pt-6">
          <h2 className="text-lg font-semibold">
            {selfManaged.length ? "Need a separate rental workspace?" : "Create your rental workspace"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Use a new self-managing workspace when this rental belongs to you rather than to a property
            management business you operate for someone else.
          </p>
          <Button asChild className="mt-4">
            <Link href="/onboarding/organization?path=self_managing">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create self-managing workspace
            </Link>
          </Button>
        </section>
      ) : null}
    </div>
  );
}
