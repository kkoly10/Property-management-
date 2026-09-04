import Link from "next/link";
import { ArrowLeft, BadgeCheck, CircleAlert, FileSignature } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getSignatureCertificate } from "@/lib/data/signatures";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function fmtUtc(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} UTC`;
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className={`text-sm ${mono ? "break-all font-mono text-xs" : ""}`}>{children}</dd>
  </div>;
}

export default async function SignatureCertificatePage({ params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const state = await getSignatureCertificate(deliveryId);

  return <div className="min-h-screen bg-[#f6f8fb] pb-24 print:bg-white">
    <header className="border-b bg-white print:hidden"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Secure signing</Badge></div></header>
    <main className="mx-auto max-w-3xl space-y-5 p-5 sm:py-8">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm"><Link href="/documents"><ArrowLeft className="h-4 w-4" />Documents</Link></Button>
        {state.mode === "ready" || state.mode === "setup" ? <PrintButton /> : null}
      </div>

      {state.mode === "missing" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Certificate not found</AlertTitle><AlertDescription>No signature has been recorded for this document, or you do not have access to it.</AlertDescription></Alert> : null}
      {state.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Certificate unavailable</AlertTitle><AlertDescription>Refresh and try again.{state.requestId ? ` Request ${state.requestId}.` : ""}</AlertDescription></Alert> : null}

      {state.certificate ? (() => {
        const c = state.certificate;
        return <Card><CardContent className="space-y-6 p-6 sm:p-8">
          {state.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Certificate preview</AlertTitle><AlertDescription>A sample certificate until the workspace is connected.</AlertDescription></Alert> : null}
          <div className="flex items-start justify-between gap-4 border-b pb-5">
            <div>
              <div className="flex items-center gap-2 text-primary"><FileSignature className="h-5 w-5" /><p className="text-sm font-semibold uppercase tracking-wide">Certificate of Completion</p></div>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{c.documentTitle}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Electronic signature record · ESIGN Act &amp; UETA</p>
            </div>
            <Badge variant="success" className="gap-1 whitespace-nowrap"><BadgeCheck className="h-3.5 w-3.5" />Signed</Badge>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Verification code</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wider">{c.verificationCode}</p>
            <p className="mt-1 text-xs text-muted-foreground">Anyone holding this certificate can compare this code against the record on file.</p>
          </div>

          <dl className="divide-y">
            <Row label="Signer">{c.signerName}{c.signerEmail ? <span className="text-muted-foreground"> · {c.signerEmail}</span> : null}</Row>
            <Row label="Statement signed">{c.intentStatement}</Row>
            <Row label="Signed at">{fmtUtc(c.signedAt)}</Row>
            <Row label="Document delivered">{fmtUtc(c.deliveredAt)}</Row>
            <Row label="First opened by signer">{fmtUtc(c.firstViewedAt)}</Row>
            <Row label="Document version">{c.versionNumber ? `Version ${c.versionNumber}` : "—"} · {c.documentType.replaceAll("_", " ")}</Row>
            <Row label="Document fingerprint (SHA-256)" mono>{c.documentSha256}</Row>
            <Row label="Signer IP address">{c.ipAddress ?? "Not recorded"}</Row>
            <Row label="Signer device">{c.userAgent ?? "Not recorded"}</Row>
            <Row label="Authentication level">{c.authAssuranceLevel ? c.authAssuranceLevel.toUpperCase() : "Portal account (single factor)"}</Row>
            <Row label="Consent disclosure">{c.esignConsentVersion.split("#")[0]}</Row>
            <Row label="Tamper-evident seal (SHA-256)" mono>{c.signatureSeal}</Row>
          </dl>

          <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
            This certificate records an electronic signature executed under the U.S. ESIGN Act (15 U.S.C. §7001)
            and the Uniform Electronic Transactions Act. The seal is a SHA-256 hash over every field of the
            signature record; any later alteration of the record would fail to reproduce it. Crecy provides the
            signing software and is not a party to the signed document.
          </div>
        </CardContent></Card>;
      })() : null}
    </main>
  </div>;
}
