import Link from "next/link";
import { ArrowLeft, BadgeCheck, CircleAlert, Download, FileText, PenLine, ShieldCheck } from "lucide-react";
import { DocumentAcknowledgeForm } from "@/app/documents/document-acknowledge-form";
import { EmptyState } from "@/components/crecy/empty-state";
import { PageHeader } from "@/components/crecy/page-header";
import { OwnerShell } from "@/components/owner/owner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRecipientDocumentDeliveries } from "@/lib/data/documents";

export const dynamic = "force-dynamic";

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const delivered = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
  : "Delivery pending";

export default async function OwnerDocumentsPage() {
  const deliveries = await getRecipientDocumentDeliveries();

  return (
    <OwnerShell chromeTitle="Ownership records" chromeDescription="Delivered documents, signatures, and certificates">
      <div className="space-y-7">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/owner"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Owner overview</Link>
        </Button>

        <PageHeader
          context="Ownership document register"
          title="Documents delivered to you"
          description="Review the exact versions shared with your ownership, acknowledge receipt, and retain signature certificates as durable evidence."
          meta={`${deliveries.items.length} ${deliveries.items.length === 1 ? "delivery record" : "delivery records"}`}
        />

        {deliveries.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
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
          <section aria-label="Owner document register" className="overflow-hidden border-y bg-card sm:rounded-xl sm:border">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(150px,.55fr)_minmax(170px,.65fr)_auto] gap-4 border-b bg-[var(--surface-subtle)]/70 px-6 py-3 text-xs font-medium text-muted-foreground lg:grid">
              <span>Document</span>
              <span>Delivery</span>
              <span>Record state</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y">
              {deliveries.items.map((item) => {
                const signed = Boolean(item.signature);
                const acknowledged = item.acknowledgements.some((ack) => ack.type === "received" || ack.type === "accepted");
                return (
                  <article key={item.deliveryId} className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(150px,.55fr)_minmax(170px,.65fr)_auto] lg:items-start lg:gap-4">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <h2 className="font-semibold tracking-[-0.01em]">{item.title}</h2>
                          <p className="mt-1 text-xs text-muted-foreground">{titleCase(item.documentType)}{item.versionNumber ? ` · Version ${item.versionNumber}` : ""}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground lg:hidden">Delivery</p>
                      <p className="mt-1 text-sm font-medium lg:mt-0">{delivered(item.deliveredAt)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{titleCase(item.status)}</p>
                    </div>

                    <div>
                      <p className="mb-2 text-xs text-muted-foreground lg:hidden">Record state</p>
                      {signed ? (
                        <Badge variant="success"><PenLine aria-hidden="true" className="h-3.5 w-3.5" />Signed</Badge>
                      ) : acknowledged ? (
                        <Badge variant="success"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Acknowledged</Badge>
                      ) : <Badge variant="warning">Awaiting response</Badge>}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:max-w-[210px] lg:justify-end">
                      {item.documentId ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/api/v1/documents/${item.documentId}/download`}><Download aria-hidden="true" className="h-4 w-4" />Download</Link>
                        </Button>
                      ) : null}
                      {signed ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/documents/${item.deliveryId}/certificate`}><BadgeCheck aria-hidden="true" className="h-4 w-4" />Certificate</Link>
                        </Button>
                      ) : (
                        <>
                          <Button asChild size="sm">
                            <Link href={`/documents/${item.deliveryId}/sign`}><PenLine aria-hidden="true" className="h-4 w-4" />Review &amp; sign</Link>
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
          <div className="border-y bg-card sm:rounded-xl sm:border">
            <EmptyState icon={FileText} title="No documents delivered" description="Documents your operator delivers to your exact owner relationship will appear in this register." className="py-14" />
          </div>
        ) : null}
      </div>
    </OwnerShell>
  );
}
