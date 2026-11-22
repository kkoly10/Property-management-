import Link from "next/link";
import { Mail, MessageSquareText } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRentalInquiryWorkspace } from "@/lib/data/rental-inquiries";
import { InquiryActions } from "./inquiry-actions";

export const dynamic = "force-dynamic";

function received(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

export default async function RentalInquiriesPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  if (!z.uuid().safeParse(unitId).success) notFound();
  const workspace = await getRentalInquiryWorkspace(unitId);
  if (workspace.mode === "unavailable") redirect("/app");
  if (workspace.mode === "not_found") notFound();
  if (workspace.mode === "error") {
    return <p role="alert">Rental inquiries could not be loaded. Refresh to try again.</p>;
  }
  const preview = workspace.mode === "setup";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link href={`/app/rentals/${unitId}`} className="text-sm font-medium text-primary">Back to my rental</Link>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Verified rental questions</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{workspace.unitName}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Only questions from people who verified control of their email address appear here.
          This inbox does not score, rank, approve, or reject prospective renters.
        </p>
      </header>
      {preview ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Sample inquiry preview. The person and email below are fictional.
        </p>
      ) : null}
      {workspace.items.length ? (
        <div className="divide-y rounded-xl border bg-card">
          {workspace.items.map((item) => (
            <article key={item.id} className="grid gap-5 p-5 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{item.firstName} {item.lastName}</h2>
                  <Badge variant={item.status === "open" ? "success" : "neutral"}>{item.status}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail aria-hidden="true" className="h-4 w-4" />{item.email}
                  </span>
                  <span>{received(item.createdAt)}</span>
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-lg bg-muted/45 p-4">
                  <MessageSquareText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.question}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-row gap-2 md:flex-col md:items-end">
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${encodeURIComponent(item.email)}`}>Reply by email</a>
                </Button>
                {item.status === "open" ? (
                  <InquiryActions
                    organizationId={workspace.organizationId ?? ""}
                    inquiryId={item.id}
                    initialVersion={item.version}
                    disabled={preview}
                  />
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">No verified questions yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Questions appear here only after the renter verifies their email.
          </p>
        </div>
      )}
    </div>
  );
}
