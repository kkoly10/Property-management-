import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRentalApplicationWorkspace } from "@/lib/data/rental-applications";
import { ApplicationActions } from "./application-actions";

export const dynamic = "force-dynamic";

export default async function RentalApplicationsPage({
  params,
}: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const workspace = await getRentalApplicationWorkspace(unitId);
  if (workspace.mode === "unavailable") redirect("/app");
  if (workspace.mode === "not_found") notFound();
  if (workspace.mode === "error") return (
    <p role="alert">Applications could not be loaded. Refresh to retry.</p>
  );
  return (
    <main className="mx-auto max-w-5xl space-y-7">
      <Link href={`/app/rentals/${unitId}`} className="text-sm font-medium text-primary">
        Back to my rental
      </Link>
      <header>
        <p className="text-sm font-semibold text-primary">Verified rental applications</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{workspace.unitName}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Applicants appear in chronological order only after verifying their email.
          Crecy does not screen, rank, recommend, approve, or reject people automatically.
          You choose whether to prepare a lease.
        </p>
      </header>
      {workspace.mode === "setup" ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Preview workspace. Connect an organization and publish a listing to receive verified applications.
        </p>
      ) : null}
      {!workspace.items.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">No verified applications yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Share the rental link. Applications appear here after email verification.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {workspace.items.map((item) => (
            <article key={item.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{item.firstName} {item.lastName}</h2>
                  <Badge variant={item.status === "submitted" ? "success" : "neutral"}>
                    {item.status.replaceAll("_", " ")}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span>
                </div>
                <p className="mt-2 break-words text-sm text-muted-foreground">{item.email}</p>
                <div className="mt-4 grid gap-2 rounded-lg bg-muted/45 p-4 text-sm sm:grid-cols-2">
                  <p>Desired move-in: <strong>{item.desiredMoveInOn}</strong></p>
                  <p>Advertised rent: <strong>{new Intl.NumberFormat("en-US", {
                    style: "currency", currency: item.currencyCode,
                  }).format(item.rentAmountMinor / 100)}</strong></p>
                  {item.leaseTermText ? <p>Preferred term: {item.leaseTermText}</p> : null}
                  <p className="text-muted-foreground">Received {item.createdAt.slice(0, 10)}</p>
                </div>
                {item.applicantNote ? (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.applicantNote}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${encodeURIComponent(item.email)}`}>Reply by email</a>
                </Button>
                {item.status === "submitted" || item.status === "lease_preparation" ? (
                  <ApplicationActions organizationId={workspace.organizationId ?? ""}
                    applicationId={item.id} initialVersion={item.version}
                    status={item.status} disabled={workspace.mode === "setup"}
                    unitId={unitId} />
                ) : null}
                {item.status === "converted" ? (
                  <span className="text-xs text-muted-foreground">Converted to signed tenancy</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
