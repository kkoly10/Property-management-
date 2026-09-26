import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";
export const dynamic = "force-dynamic";
export default async function RentalPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const workspace = await getRentalWorkspace();
  if (workspace.mode === "unavailable") redirect("/app");
  if (workspace.mode === "error") return <p role="alert">This rental could not be loaded. Refresh to try again.</p>;
  // Only the unconnected setup harness gets this explicit sample. A configured database never
  // falls back to sample data for missing or inaccessible rows.
  const preview = workspace.mode === "setup" && unitId === "80000000-0000-4000-8000-000000000008";
  const unit = preview ? { id: unitId, property_id: "preview-property", unit_code: "Sample basement apartment",
    rental_details: { entrance: "private", kitchen: "shared", bathroom: "private", laundry: "shared",
      utilitiesNotes: "Example: water included; electricity shared by agreement.", parkingNotes: "Example: one driveway space." } as Record<string, unknown> }
    : workspace.units.find((item) => item.id === unitId);
  const property = preview ? { id: "preview-property", address_line1: "123 Example Street", locality: "Example City", time_zone: "America/New_York" }
    : workspace.properties.find((item) => item.id === unit?.property_id);
  if (!unit || !property) notFound();
  const occupied = workspace.occupiedUnitIds.includes(unit.id);
  const details = unit.rental_details ?? {};
  return <div className="mx-auto max-w-4xl space-y-8">
    <Link href="/app/rentals" className="text-sm font-medium text-primary">Back to my rentals</Link>
    {preview && <p className="rounded-lg border p-4 text-sm">Sample rental preview. These are fictional details, not a saved rental. Connect your workspace to use this flow.</p>}
    <header className="border-b pb-6"><h1 className="break-words text-3xl font-semibold tracking-tight">{unit.unit_code}</h1>
      <p className="mt-3 break-words text-muted-foreground">{property.address_line1} · {property.locality}</p>
      <p className="mt-2 text-sm text-muted-foreground">Private rental record · {property.time_zone}</p></header>
    <section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">{occupied ? "Manage your rental" : "Do you already have a signed agreement?"}</h2>
      <p className="mt-3 leading-7 text-muted-foreground">{occupied ? "Your existing renter relationship is connected to the management tools." : "Record the agreement and renter through Crecy’s existing tenancy workflow. You will review the opening balance and first rent charge before activation."}</p>
      <div className="mt-5 flex flex-wrap gap-3">{preview ? <><Button disabled>Connect your workspace to continue</Button><Button variant="outline" asChild><Link href={`/app/rentals/${unit.id}/listing`}>Preview shareable listing setup</Link></Button></> : <><Button asChild><Link href={occupied ? "/app/residents" : `/app/rentals/${unit.id}/setup`}>{occupied ? "View renters and invitations" : "Add my existing renter"}</Link></Button>
        {!occupied ? <Button variant="outline" asChild><Link href={`/app/rentals/${unit.id}/listing`}>Create shareable listing</Link></Button> : null}
        <Button variant="outline" asChild><Link href={`/app/properties/${property.id}`}>Property details</Link></Button></>}</div>
      {!occupied && <p className="mt-4 text-sm text-muted-foreground">Not signed yet? You can share an unlisted Crecy page yourself. Crecy marketplace discovery is not enabled in this release.</p>}
    </section>
    <section><h2 className="text-xl font-semibold">What is private or shared</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2">{["entrance", "kitchen", "bathroom", "laundry"].map((key) => <div key={key} className="border-b pb-3"><dt className="capitalize text-muted-foreground">{key}</dt><dd className="mt-1 font-medium">{typeof details[key] === "string" ? String(details[key]).replace("none", "Not provided") : "Not recorded"}</dd></div>)}</dl>
      {["utilitiesNotes", "parkingNotes"].map((key) => typeof details[key] === "string" && details[key] ? <div key={key} className="mt-5"><h3 className="font-medium">{key === "utilitiesNotes" ? "Utilities" : "Parking"}</h3><p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{String(details[key])}</p></div> : null)}</section>
  </div>;
}
