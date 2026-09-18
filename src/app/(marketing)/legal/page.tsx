import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listLegalDocuments } from "@/lib/legal/registry";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const dynamic = "force-static";

export const metadata: Metadata = marketingMetadata({
  title: "Legal documents",
  description:
    "The current version of every Crecy legal document, with its version, effective date and whether it is published or still a draft.",
  path: "/legal",
});

/** The index of every legal artifact, with its version, effective date and publication state. */
export default function LegalIndexPage() {
  const documents = listLegalDocuments();
  return (
    // The public header and footer come from the marketing layout, so this renders content only — a
    // nested <main> inside the layout's would be invalid, and a second wordmark would be a duplicate.
    <div className="mx-auto max-w-3xl px-5 py-12 lg:py-16">
      <h1 className="text-3xl font-semibold tracking-[-0.035em]">Legal documents</h1>
      {/* "Every version" was true when each document had exactly one. Superseded versions are now kept
          as archived artifacts and are deliberately not listed or routed here, so the page has to say
          what it actually shows: the current one. Claiming otherwise would let a reader conclude an old
          version no longer exists. */}
      <p className="mt-2 text-sm text-muted-foreground">
        The current version of each document, and the state it is in. A document is only binding once it
        is published; a superseded version stays on record as the text the people who accepted it were
        shown.
      </p>
      <div className="mt-8 space-y-3">
        {documents.map((document) => (
          <Card key={`${document.code}@${document.version}`}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={document.route} className="font-semibold hover:underline" data-testid={`legal-link-${document.code}`}>
                    {document.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Version {document.version} · effective {document.effectiveDate} · {document.audience}
                  </p>
                </div>
                <Badge variant={document.state === "published" ? "success" : "warning"}>{document.state}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
