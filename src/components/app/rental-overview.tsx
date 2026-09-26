import Link from "next/link";
import { ArrowRight, Plus, House } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RentalWorkspace } from "@/lib/data/homeowner-rentals";

export function RentalOverview({ workspace }: { workspace: RentalWorkspace }) {
  const properties = new Map(workspace.properties.map((property) => [property.id, property]));
  return <div className="mx-auto max-w-5xl space-y-8">
    <header className="flex flex-wrap items-start justify-between gap-5 border-b pb-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Your rentals, in one place</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">Start with your space. Add the renter and agreement you already have, then manage the rental here.</p></div>
      <Button asChild><Link href="/app/rentals/new"><Plus className="h-4 w-4" />Add a rental</Link></Button>
    </header>
    {workspace.mode === "error" ? <p role="alert" className="rounded-lg border border-destructive/40 p-5">Your rentals could not be loaded. Refresh before creating anything else.</p>
      : workspace.units.length === 0 ? <section className="grid gap-6 rounded-xl border bg-card p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <House aria-hidden="true" className="h-10 w-10 text-primary" />
        <div><h2 className="text-xl font-semibold">A basement, a room, or a whole home</h2>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">Describe what is private or shared and who operates the rental. Crecy keeps the property and rental account organized behind the scenes.</p>
          <p className="mt-3 text-sm text-muted-foreground">This is private setup. It does not publish a listing, send invitations, or collect rent.</p>
          {workspace.mode === "setup" && <p className="mt-3 text-sm">Preview only. Connect a self-managing workspace to save a real rental.</p>}
        </div></section>
      : <div className="divide-y rounded-xl border bg-card">{workspace.units.map((unit) => {
        const property = properties.get(unit.property_id);
        return <Link key={unit.id} href={`/app/rentals/${unit.id}`} className="flex items-center justify-between gap-5 p-5 transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-ring">
          <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{unit.unit_code}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{property?.address_line1}{property?.locality ? ` · ${property.locality}` : ""}</p>
            <p className="mt-2 text-sm">{workspace.occupiedUnitIds.includes(unit.id) ? "Rental relationship recorded" : "Ready for renter setup"}</p></div>
          <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
        </Link>;
      })}</div>}
    <p className="text-sm text-muted-foreground">You do not need a Crecy listing to manage a renter you found elsewhere.</p>
  </div>;
}
