import Link from "next/link";
import { ArrowLeft, BadgeCheck, CircleAlert, Download, FileText, ShieldCheck, PenLine } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getRecipientDocumentDeliveries } from "@/lib/data/documents";
import { DocumentAcknowledgeForm } from "@/app/documents/document-acknowledge-form";

export const dynamic = "force-dynamic";

export default async function OwnerDocumentsPage() {
  const deliveries = await getRecipientDocumentDeliveries();
  return <div className="min-h-screen bg-[#f6f8fb] pb-12">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Wordmark product="Owner" /></div></header>
    <main className="mx-auto max-w-5xl space-y-5 p-5 sm:py-8">
      <Button asChild variant="ghost" size="sm"><Link href="/owner"><ArrowLeft className="h-4 w-4" />Owner workspace</Link></Button>
      <div><p className="text-sm text-muted-foreground">Documents</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Delivered to you</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Statements, agreements, and notices shared with your ownership. Signing is a legally binding electronic signature; a certificate is kept for every document you sign.</p></div>
      {deliveries.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Documents preview</AlertTitle><AlertDescription>This sample shows delivered documents until Supabase is connected.</AlertDescription></Alert> : null}
      {deliveries.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Documents unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {deliveries.requestId}.</AlertDescription></Alert> : null}
      {deliveries.items.length ? <div className="grid gap-3">{deliveries.items.map((item) => {
        const signed = Boolean(item.signature);
        const acknowledged = item.acknowledgements.some((ack) => ack.type === "received" || ack.type === "accepted");
        return <Card key={item.deliveryId}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><FileText className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{item.title}</p>{signed ? <Badge variant="success" className="gap-1"><PenLine className="h-3.5 w-3.5" />Signed</Badge> : acknowledged ? <Badge variant="success" className="gap-1"><ShieldCheck className="h-3.5 w-3.5" />Acknowledged</Badge> : <Badge variant="warning">Awaiting your response</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{item.documentType.replaceAll("_", " ")}{item.deliveredAt ? ` · delivered ${new Date(item.deliveredAt).toLocaleDateString()}` : ""}{item.versionNumber ? ` · v${item.versionNumber}` : ""}</p></div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {item.documentId ? <Button asChild variant="outline" size="sm"><Link href={`/api/v1/documents/${item.documentId}/download`}><Download className="h-4 w-4" />Download</Link></Button> : null}
            {signed ? <Button asChild size="sm" variant="secondary"><Link href={`/documents/${item.deliveryId}/certificate`}><BadgeCheck className="h-4 w-4" />View certificate</Link></Button> : <>
              <Button asChild size="sm"><Link href={`/documents/${item.deliveryId}/sign`}><PenLine className="h-4 w-4" />Review &amp; sign</Link></Button>
              <DocumentAcknowledgeForm deliveryId={item.deliveryId} organizationId={item.organizationId} evidenceHash={item.sha256Hex} acknowledged={acknowledged} disabled={deliveries.mode !== "ready"} />
            </>}
          </div>
        </CardContent></Card>;
      })}</div> : deliveries.mode !== "error" ? <Card><CardContent className="py-14 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No documents yet</h2><p className="mt-2 text-sm text-muted-foreground">Documents your operator delivers will appear here.</p></CardContent></Card> : null}
    </main>
  </div>;
}
