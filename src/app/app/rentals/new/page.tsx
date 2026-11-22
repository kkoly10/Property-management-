import Link from "next/link";
import { redirect } from "next/navigation";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";
import { RentalSetupForm } from "./rental-setup-form";
export const dynamic = "force-dynamic";
export default async function RentalSetupPage() {
  const workspace = await getRentalWorkspace();
  if (workspace.mode === "unavailable") redirect("/app");
  return <div className="mx-auto max-w-3xl space-y-7">
    <Link href="/app/rentals" className="text-sm font-medium text-primary">Back to my rentals</Link>
    <header><h1 className="text-3xl font-semibold tracking-tight">Tell us about your rental</h1>
      <p className="mt-3 leading-7 text-muted-foreground">A few details about the home and the space you rent. Your address stays private; this does not publish a listing.</p></header>
    {workspace.mode === "error" ? <p role="alert">Setup information is unavailable. Refresh before continuing.</p>
      : <RentalSetupForm key={`${workspace.actorId}:${workspace.organization?.organizationId}`} workspace={workspace} />}
  </div>;
}
