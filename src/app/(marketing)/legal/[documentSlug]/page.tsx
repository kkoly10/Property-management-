import Link from "next/link";
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
 * Inline emphasis inside a legal paragraph.
 *
 * The body is authored in markdown and the block renderer below handles headings and lists, but not
 * `**bold**` — so every emphasized span rendered as literal asterisks on the public page, including the
 * "Status: DRAFT — not binding until published" line on both documents, where the emphasis is doing the
 * most work.
 *
 * This builds React elements rather than injecting HTML, so nothing in a document body can become
 * markup. It also does not touch `document.body`, which is what the content hash covers — rendering is
 * a display concern and consent evidence must stay bound to the source text.
 */
function renderInline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${key}-i${index}`} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
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
      {/* Moving this page into the marketing shell replaced its wordmark, which used to link back to the
          index. The header now goes to the homepage instead, so the way back to the other documents was
          only in the footer — restore the direct route. */}
      <Link href="/legal" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        &larr; All legal documents
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-3">
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
                {block.split("\n").map((line, lineIndex) => (
                  <li key={`${key}-${lineIndex}`}>{renderInline(line.replace(/^-\s*/, ""), `${key}-${lineIndex}`)}</li>
                ))}
              </ul>
            );
          }
          return <p key={key}>{renderInline(block, key)}</p>;
        })}
      </article>

      <p className="mt-10 break-all border-t pt-4 font-mono text-xs text-muted-foreground" data-testid="legal-content-hash">
        Content hash (SHA-256): {document.contentHash}
      </p>
    </div>
  );
}
