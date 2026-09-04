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

/**
 * The signing ceremony. Its job is to produce the four things ESIGN/UETA require an enforceable
 * electronic signature to demonstrate, in an order the signer cannot skip:
 *   1. Consent — the full ESIGN disclosure is shown and affirmatively accepted before anything else.
 *   2. Review  — the exact document is available to open and read.
 *   3. Intent  — the signer adopts their name and deliberately signs against a stated affirmation.
 * The affirmation shown here is the exact `intentStatement` recorded on the signature, so the evidence
 * reflects precisely what the signer agreed to. IP, device, the document's authoritative hash, and the
 * consent version are captured server-side.
 */
const INTENT_STATEMENT =
  "I have read and agree to this document, and I intend my electronic signature below to legally bind me to it.";

export function SignCeremony({
  deliveryId,
  organizationId,
  documentTitle,
  documentId,
  versionNumber,
  esignConsent,
  disabled,
}: {
  deliveryId: string;
  organizationId: string;
  documentTitle: string;
  documentId: string | null;
  versionNumber: number | null;
  esignConsent: EsignConsentSummary | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [consented, setConsented] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const steps = ["Consent", "Review", "Sign"];
  const canContinueConsent = consented && Boolean(esignConsent);
  const canSign = signerName.trim().length >= 2;

  async function sign() {
    if (!esignConsent) { setError("The signing disclosure is unavailable. Refresh and try again."); return; }
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
          intentAffirmed: true,
          intentStatement: INTENT_STATEMENT,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        idempotencyKey.current = null;
        throw new Error(body.error ?? "Your signature could not be recorded.");
      }
      router.replace(`/documents/${deliveryId}/certificate`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your signature could not be recorded.");
      setPending(false);
    }
  }

  return <div className="space-y-6">
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((label, index) => <li key={label} className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${index < step ? "bg-primary text-primary-foreground" : index === step ? "bg-primary/15 text-primary ring-2 ring-primary/30" : "bg-muted text-muted-foreground"}`}>
          {index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
        </span>
        <span className={index === step ? "font-medium" : "text-muted-foreground"}>{label}</span>
        {index < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
      </li>)}
    </ol>

    {step === 0 ? <section className="space-y-4">
      <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Consent to sign electronically</h2></div>
      <p className="text-sm leading-6 text-muted-foreground">Before you sign, please read this disclosure of your rights. Signing electronically is legally the same as signing on paper.</p>
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
      <div className="flex justify-end"><Button disabled={!canContinueConsent || disabled} onClick={() => setStep(1)}>Continue</Button></div>
    </section> : null}

    {step === 1 ? <section className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Review the document</h2></div>
      <p className="text-sm leading-6 text-muted-foreground">Open and read <span className="font-medium text-foreground">{documentTitle}</span>{versionNumber ? ` (version ${versionNumber})` : ""} before you sign. Your signature will be bound to this exact version.</p>
      {documentId ? <Button asChild variant="outline"><Link href={`/api/v1/documents/${documentId}/download`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />Open the document</Link></Button> : <Alert variant="info"><AlertTitle>Document</AlertTitle><AlertDescription>This document will open for review once the workspace is connected.</AlertDescription></Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="signer-name">Adopt your signature — type your full legal name</Label>
        <Input id="signer-name" value={signerName} disabled={disabled} onChange={(event) => setSignerName(event.target.value)} placeholder="Jordan Q. Rivera" autoComplete="name" maxLength={160} />
        {signerName.trim() ? <p className="pt-1 font-[cursive] text-2xl text-foreground">{signerName.trim()}</p> : null}
      </div>
      <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(0)}>Back</Button><Button disabled={!canSign || disabled} onClick={() => setStep(2)}>Continue</Button></div>
    </section> : null}

    {step === 2 ? <section className="space-y-4">
      <div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Sign</h2></div>
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm leading-6">{INTENT_STATEMENT}</p>
        <p className="mt-3 font-[cursive] text-2xl">{signerName.trim()}</p>
        <p className="mt-1 text-xs text-muted-foreground">Signing records your name, this device and network address, the exact document version, and the date and time.</p>
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>Not signed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex justify-between">
        <Button variant="ghost" disabled={pending} onClick={() => setStep(1)}>Back</Button>
        <Button disabled={pending || disabled || !canSign} onClick={sign}>
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}Sign document
        </Button>
      </div>
      {disabled ? <p className="text-right text-xs text-muted-foreground">Signing becomes available once this workspace is connected.</p> : null}
    </section> : null}
  </div>;
}
