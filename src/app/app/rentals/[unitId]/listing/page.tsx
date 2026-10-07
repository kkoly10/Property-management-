import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { RentalListingForm } from "./listing-form";
import { getRentalListingWorkspace } from "@/lib/data/rental-listings";
import { hostConfig } from "@/lib/runtime/host";

export const dynamic = "force-dynamic";

export default async function RentalListingManagementPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const workspace = await getRentalListingWorkspace(unitId);
  if (workspace.mode === "unavailable") redirect("/app");
  if (workspace.mode === "not_found") notFound();
  if (workspace.mode === "error") {
    return <p role="alert">This listing workspace could not be loaded. Refresh to try again.</p>;
  }
  const preview = workspace.mode === "setup";
  const shareOrigin = `https://${hostConfig().rentals}`;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-primary">
        <Link href={`/app/rentals/${unitId}`}>Back to my rental</Link>
        <Link href={`/app/rentals/${unitId}/inquiries`}>View verified questions</Link>
      </div>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Shareable rental listing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Find a renter without waiting for marketplace traffic</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Build one polished Crecy page and share the link wherever you already reach renters.
          Marketplace discovery is deliberately off in this release.
        </p>
      </header>
      <RentalListingForm
        key={workspace.listing?.id ?? "new-listing"}
        organizationId={workspace.organizationId ?? "00000000-0000-4000-8000-000000000001"}
        unitId={unitId}
        unitName={preview ? "Sample basement apartment" : workspace.unitName}
        currencyCode={workspace.currencyCode}
        initialListing={workspace.listing}
        initialPhotos={workspace.photos}
        shareOrigin={shareOrigin}
        disabled={preview}
      />
    </div>
  );
}
