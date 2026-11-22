"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Download, FileSignature, LoaderCircle, LockKeyhole, PenLine, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EsignConsentSummary } from "@/lib/data/signatures";
import { documentSigningIntent } from "@/lib/documents/signing";

export function SignCeremony({
  deliveryId,
  organizationId,
  documentTitle,
  versionId,
  sha256Hex,
  versionNumber,
  esignConsent,
  disabled,
}: {
  deliveryId: string;
  organizationId: string;
  documentTitle: string;
  versionId: string | null;
  sha256Hex: string | null;
  versionNumber: number | null;
  esignConsent: EsignConsentSummary | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [consented, setConsented] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const steps = ["Consent", "Review", "Sign"];
  const canContinueConsent = consented && Boolean(esignConsent);
  const canSign = Boolean(reviewed && versionId && sha256Hex && signerName.trim().length >= 2);

  async function sign() {
    if (!esignConsent || !versionId || !sha256Hex || !canSign) {
      setError("Review the disclosure and the pinned document version before signing.");
      return;
    }
    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/document-deliveries/${deliveryId}/signature`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          organizationId,
          signerName: signerName.trim(),
          esignConsentAgreed: true,
          esignConsentVersion: esignConsent.version,
          reviewedVersionId: versionId,
          reviewedSha256: sha256Hex,
          documentReviewConfirmed: true,
          intentAffirmed: true,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; signatureId?: string };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 409) idempotencyKey.current = null;
        throw new Error(body.error ?? "Your signature could not be recorded.");
      }
      if (!body.signatureId) throw new Error("The signing result could not be confirmed. Retry to check the result.");
      router.replace(`/documents/${deliveryId}/certificate`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your signature could not be recorded.");
      setPending(false);
    }
  }

  return <div className="space-y-6">
    {/* Wraps and drops the connector rules on a narrow screen. Three numbered steps plus two 24px
        rules and their margins need 370px, which pushed the signing page past a 320px phone — and
        this is a resident-facing legal ceremony, so it has to hold together on the smallest device
        someone might sign from. The rules are decoration; the numbers carry the sequence. */}
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
      {steps.map((label, index) => <li key={label} className="flex items-center gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index < step ? "bg-primary text-primary-foreground" : index === step ? "bg-primary/15 text-primary ring-2 ring-primary/30" : "bg-muted text-muted-foreground"}`}>
          {index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
        </span>
        <span className={index === step ? "font-medium" : "text-muted-foreground"}>{label}</span>
        {index < steps.length - 1 ? <span aria-hidden="true" className="mx-1 hidden h-px w-6 bg-border sm:block" /> : null}
      </li>)}
    </ol>

    {step === 0 ? <section className="space-y-4">
      <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Consent to sign electronically</h2></div>
      <p className="text-sm leading-6 text-muted-foreground">Read the electronic signing disclosure and confirm that you can keep the records.</p>
      {esignConsent ? <div className="max-h-72 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm leading-6">
        {esignConsent.body.split("\n").map((line, index) => {
          const heading1 = line.startsWith("# ");
          const heading2 = line.startsWith("## ");
          const clean = line.replace(/^#{1,6}\s+/, "").replaceAll("**", "");
          if (!clean.trim()) return <div key={index} className="h-2" />;
          if (heading1) return <p key={index} className="mt-1 text-base font-semibold">{clean}</p>;
          if (heading2) return <p key={index} className="mt-3 font-semibold">{clean}</p>;
          return <p key={index} className="mt-1 text-muted-foreground">{clean}</p>;
        })}
      </div> : <Alert variant="destructive"><AlertTitle>Disclosure unavailable</AlertTitle><AlertDescription>The signing disclosure could not be loaded. Refresh and try again.</AlertDescription></Alert>}
      {esignConsent ? <p className="text-xs text-muted-foreground">Disclosure version {esignConsent.version.split("#")[0]} · effective {esignConsent.effectiveDate} · <Link className="underline" href={esignConsent.route} target="_blank" rel="noreferrer">open full text</Link></p> : null}
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={consented} disabled={disabled} onChange={(event) => setConsented(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary" />
        <span>I have read the disclosure above, I can access and keep these records, and I consent to use electronic records and signatures for this document.</span>
      </label>
      <div className="flex justify-end"><Button className="w-full sm:w-auto" disabled={!canContinueConsent || disabled} onClick={() => setStep(1)}>Continue</Button></div>
    </section> : null}

    {step === 1 ? <section className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Review the document</h2></div>
      <p className="text-sm leading-6 text-muted-foreground">Open and read <span className="font-medium text-foreground">{documentTitle}</span>{versionNumber ? ` (version ${versionNumber})` : ""} before you sign. Your signature will be bound to this exact version.</p>
      {versionId && !disabled ? <Button asChild variant="outline" className="w-full sm:w-auto"><Link href={`/api/v1/document-deliveries/${deliveryId}/download?version=${versionId}`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />Open delivered version</Link></Button> : <Alert variant="info"><AlertTitle>Document unavailable</AlertTitle><AlertDescription>Return to your documents to check the delivery.</AlertDescription></Alert>}
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={reviewed} disabled={disabled} onChange={(event) => setReviewed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary" />
        <span>I reviewed the delivered version shown above.</span>
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="signer-name">Adopt your signature — type your full legal name</Label>
        <Input id="signer-name" value={signerName} disabled={disabled} onChange={(event) => { setSignerName(event.target.value); idempotencyKey.current = null; }} placeholder="Jordan Q. Rivera" autoComplete="name" maxLength={160} />
        {signerName.trim() ? <p className="pt-1 font-[cursive] text-2xl text-foreground">{signerName.trim()}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3"><Button className="w-full" variant="ghost" onClick={() => setStep(0)}>Back</Button><Button className="w-full" disabled={!canSign || disabled} onClick={() => setStep(2)}>Continue</Button></div>
    </section> : null}

    {step === 2 ? <section className="space-y-4">
      <div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Sign</h2></div>
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm leading-6">{documentSigningIntent}</p>
        <p className="mt-3 font-[cursive] text-2xl">{signerName.trim()}</p>
        <p className="mt-1 text-xs text-muted-foreground">Signing records your authenticated account, typed name, disclosure version, document fingerprint, and signing time.</p>
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>Check the signing result</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button className="w-full" variant="ghost" disabled={pending} onClick={() => setStep(1)}>Back</Button>
        <Button className="w-full" disabled={pending || disabled || !canSign} onClick={sign}>
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}Sign document
        </Button>
      </div>
      {disabled ? <p className="text-right text-xs text-muted-foreground">Signing becomes available once this workspace is connected.</p> : null}
    </section> : null}
  </div>;
}
