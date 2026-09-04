import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getSignableDelivery } from "@/lib/data/signatures";
import { SignCeremony } from "./sign-ceremony";

export const dynamic = "force-dynamic";

export default async function SignDocumentPage({ params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const state = await getSignableDelivery(deliveryId);

  if (state.mode === "missing") {
    return <Shell><Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Document not found</AlertTitle><AlertDescription>This signing link is no longer valid. Return to your documents.</AlertDescription></Alert></Shell>;
  }
  if (state.mode === "error" || !state.delivery) {
    return <Shell><Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Signing unavailable</AlertTitle><AlertDescription>Refresh and try again.{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription></Alert></Shell>;
  }

  const delivery = state.delivery;
  // Already signed: nothing to do here — send the signer to their certificate.
  if (delivery.alreadySignedId) redirect(`/documents/${deliveryId}/certificate`);

  return <Shell>
    {state.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Signing preview</AlertTitle><AlertDescription>This is a preview of the signing experience until the workspace is connected.</AlertDescription></Alert> : null}
    <div>
      <p className="text-sm text-muted-foreground">Electronic signature</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Sign {delivery.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">This is a legally binding electronic signature under the ESIGN Act and UETA. You will consent, review the document, then sign.</p>
    </div>
    {!delivery.signable && state.mode === "ready" ? <Alert variant="warning"><CircleAlert className="h-5 w-5" /><AlertTitle>Not ready to sign</AlertTitle><AlertDescription>This document has not finished security scanning, or is not available to you to sign.</AlertDescription></Alert> : null}
    <Card><CardContent className="p-6">
      <SignCeremony
        deliveryId={delivery.deliveryId}
        organizationId={delivery.organizationId}
        documentTitle={delivery.title}
        documentId={delivery.documentId}
        versionNumber={delivery.versionNumber}
        esignConsent={delivery.esignConsent}
        disabled={state.mode !== "ready" || !delivery.signable}
      />
    </CardContent></Card>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f6f8fb] pb-24">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Secure signing</Badge></div></header>
    <main className="mx-auto max-w-3xl space-y-5 p-5 sm:py-8">
      <Button asChild variant="ghost" size="sm"><Link href="/documents"><ArrowLeft className="h-4 w-4" />Documents</Link></Button>
      {children}
    </main>
  </div>;
}
