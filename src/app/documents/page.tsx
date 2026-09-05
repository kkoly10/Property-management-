import Link from "next/link";
import { BadgeCheck, CircleAlert, Download, FileText, PenLine, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/crecy/empty-state";
import { PageHeader } from "@/components/crecy/page-header";
import { LivingShell } from "@/components/living/living-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRecipientDocumentDeliveries } from "@/lib/data/documents";
import { DocumentAcknowledgeForm } from "./document-acknowledge-form";

export const dynamic = "force-dynamic";

export default async function ResidentDocumentsPage() {
  const deliveries = await getRecipientDocumentDeliveries();

  return (
    <LivingShell maxWidth="max-w-5xl">
      <div className="space-y-6">
        <PageHeader
          title="Documents"
          description="Leases and notices shared by your property manager. Signed documents keep their electronic-signature certificate with the delivery record."
          meta={deliveries.mode !== "error" ? `${deliveries.items.length} delivered document${deliveries.items.length === 1 ? "" : "s"}` : undefined}
        />

        {deliveries.mode === "setup" ? (
          <Alert variant="info">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Documents preview</AlertTitle>
            <AlertDescription>This sample shows delivered documents until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}
        {deliveries.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Documents unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {deliveries.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        {deliveries.items.length ? (
          <section aria-label="Delivered documents" className="overflow-hidden rounded-[1.05rem] border bg-card">
            <div className="divide-y">
              {deliveries.items.map((item) => {
                const signed = Boolean(item.signature);
                const acknowledged = item.acknowledgements.some((ack) => ack.type === "received" || ack.type === "accepted");

                return (
                  <article key={item.deliveryId} className="grid gap-4 px-5 py-5 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-start sm:px-6">
                    <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold tracking-[-0.01em]">{item.title}</h2>
                        {signed ? (
                          <Badge variant="success" className="gap-1"><PenLine aria-hidden="true" className="h-3.5 w-3.5" />Signed</Badge>
                        ) : acknowledged ? (
                          <Badge variant="success" className="gap-1"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Acknowledged</Badge>
                        ) : (
                          <Badge variant="warning">Awaiting your response</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.documentType.replaceAll("_", " ")}
                        {item.deliveredAt ? ` · delivered ${new Date(item.deliveredAt).toLocaleDateString()}` : ""}
                        {item.versionNumber ? ` · v${item.versionNumber}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:max-w-[260px] sm:justify-end">
                      {item.documentId ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/api/v1/documents/${item.documentId}/download`}>
                            <Download aria-hidden="true" className="h-4 w-4" />
                            Download
                          </Link>
                        </Button>
                      ) : null}

                      {signed ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/documents/${item.deliveryId}/certificate`}>
                            <BadgeCheck aria-hidden="true" className="h-4 w-4" />
                            Certificate
                          </Link>
                        </Button>
                      ) : (
                        <>
                          <Button asChild size="sm">
                            <Link href={`/documents/${item.deliveryId}/sign`}>
                              <PenLine aria-hidden="true" className="h-4 w-4" />
                              Review & sign
                            </Link>
                          </Button>
                          <DocumentAcknowledgeForm
                            deliveryId={item.deliveryId}
                            organizationId={item.organizationId}
                            evidenceHash={item.sha256Hex}
                            acknowledged={acknowledged}
                            disabled={deliveries.mode !== "ready"}
                          />
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : deliveries.mode !== "error" ? (
          <div className="overflow-hidden rounded-[1.05rem] border bg-card">
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Documents your property manager delivers will appear here."
            />
          </div>
        ) : null}
      </div>
    </LivingShell>
  );
}
