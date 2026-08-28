import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { findLegalDocumentByRoute, listLegalDocuments } from "@/lib/legal/registry";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const dynamic = "force-static";

export function generateStaticParams() {
  return listLegalDocuments().map((document) => ({ documentSlug: document.route.split("/").pop() as string }));
}

export async function generateMetadata({ params }: { params: Promise<{ documentSlug: string }> }): Promise<Metadata> {
  const { documentSlug } = await params;
  const document = findLegalDocumentByRoute(`/legal/${documentSlug}`);
  if (!document) return {};
  return marketingMetadata({
    title: document.title,
    // The state belongs in the description: a draft that reads as binding is the exact failure the
    // legal registry exists to prevent, and a search result is a place someone reads it out of context.
    description: `Crecy ${document.title}, version ${document.version}, effective ${document.effectiveDate}. This version is ${document.state}.`,
    path: document.route,
  });
}

/**
 * The canonical public route for one legal artifact.
 *
 * This is what makes consent evidence point at something real: the version and content hash shown here
 * are the same values recorded on the consent record, so anyone can check what was actually accepted.
 */
export default async function LegalDocumentPage({ params }: { params: Promise<{ documentSlug: string }> }) {
  const { documentSlug } = await params;
  const document = findLegalDocumentByRoute(`/legal/${documentSlug}`);
  if (!document) notFound();

  const paragraphs = document.body.split("\n\n");

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 lg:py-16">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={document.state === "published" ? "success" : "warning"}>{document.state}</Badge>
        <span className="text-sm text-muted-foreground">
          Version {document.version} · effective {document.effectiveDate}
        </span>
      </div>

      {document.state !== "published" ? (
        <Alert variant="destructive" className="mt-4">
          <CircleAlert className="h-5 w-5" />
          <AlertTitle>This version is not published</AlertTitle>
          <AlertDescription>
            It is a draft pending legal review and is not binding on anyone. Crecy will not record consent
            against an unpublished document in production.
          </AlertDescription>
        </Alert>
      ) : null}

      <article className="mt-8 space-y-4 text-sm leading-7" data-testid="legal-document-body">
        {paragraphs.map((block, index) => {
          const key = `${document.code}-${index}`;
          if (block.startsWith("## ")) return <h2 key={key} className="pt-4 text-lg font-semibold">{block.slice(3)}</h2>;
          if (block.startsWith("# ")) return <h1 key={key} className="text-2xl font-semibold tracking-[-0.03em]">{block.slice(2)}</h1>;
          if (block.startsWith("- ")) {
            return (
              <ul key={key} className="list-disc space-y-2 pl-5">
                {block.split("\n").map((line, lineIndex) => <li key={`${key}-${lineIndex}`}>{line.replace(/^-\s*/, "")}</li>)}
              </ul>
            );
          }
          return <p key={key}>{block}</p>;
        })}
      </article>

      <p className="mt-10 break-all border-t pt-4 font-mono text-xs text-muted-foreground" data-testid="legal-content-hash">
        Content hash (SHA-256): {document.contentHash}
      </p>
    </div>
  );
}
