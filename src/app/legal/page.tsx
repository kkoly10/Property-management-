import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listLegalDocuments } from "@/lib/legal/registry";

export const dynamic = "force-static";

export const metadata = { title: "Legal documents · Crecy" };

/** The index of every legal artifact, with its version, effective date and publication state. */
export default function LegalIndexPage() {
  const documents = listLegalDocuments();
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/" className="inline-block"><Wordmark /></Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-[-0.035em]">Legal documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every version Crecy has published, and the state it is in. A document is only binding once it is
        published.
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
    </main>
  );
}
