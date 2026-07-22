"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Mode = "loading" | "intro" | "enrolling" | "scan" | "challenge" | "verifying" | "complete";

export function MfaSetup({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const supabase = createClient();
      const [assurance, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (assurance.error || factors.error) {
        setError(assurance.error?.message ?? factors.error?.message ?? "MFA settings could not be loaded.");
        setMode("intro");
        return;
      }
      if (assurance.data.currentLevel === "aal2") {
        setMode("complete");
        return;
      }
      const verifiedTotp = factors.data.totp.find((factor: { id: string; status: string }) => factor.status === "verified");
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setMode("challenge");
      } else {
        setMode("intro");
      }
    })();
  }, []);

  async function beginEnrollment() {
    setError(null);
    setMode("enrolling");
    const { data, error: enrollmentError } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "Crecy operator" });
    if (enrollmentError) {
      setError(enrollmentError.message);
      setMode("intro");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setMode("scan");
  }

  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }
    setError(null);
    setMode("verifying");
    const { error: verificationError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (verificationError) {
      setError(verificationError.message);
      setMode(qrCode ? "scan" : "challenge");
      return;
    }
    setMode("complete");
  }

  if (mode === "loading") return <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Checking authenticator status…</div>;
  if (mode === "complete") return <div className="space-y-5 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-success" /><div><h2 className="text-xl font-semibold">Identity verified</h2><p className="mt-2 text-sm text-muted-foreground">This session now meets the security requirement for payment connections.</p></div><Button onClick={() => window.location.assign(returnTo)}>Continue to payment settings</Button></div>;

  return (
    <div className="space-y-5">
      {mode === "intro" ? <div className="space-y-5 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><ShieldCheck className="h-7 w-7" /></span><div><h2 className="text-xl font-semibold">Add an authenticator</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Use an app such as 1Password, Google Authenticator, or Microsoft Authenticator. Crecy requires this step before changing payment connections.</p></div><Button onClick={beginEnrollment}>Set up authenticator</Button></div> : null}
      {mode === "enrolling" ? <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Preparing a secure QR code…</div> : null}
      {mode === "scan" ? <div className="space-y-5"><div className="text-center"><h2 className="text-xl font-semibold">Scan this QR code</h2><p className="mt-2 text-sm text-muted-foreground">Then enter the six-digit code shown by your authenticator.</p></div><div className="mx-auto w-fit rounded-xl border bg-white p-3"><Image src={qrCode} alt="Authenticator enrollment QR code" width={220} height={220} unoptimized /></div><div className="rounded-lg bg-muted p-3 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Can&apos;t scan?</p><p className="mt-1 break-all font-mono text-sm">{secret}</p></div></div> : null}
      {mode === "challenge" ? <div className="text-center"><KeyRound className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 text-xl font-semibold">Verify your identity</h2><p className="mt-2 text-sm text-muted-foreground">Enter the current code from your authenticator app.</p></div> : null}
      {mode === "scan" || mode === "challenge" || mode === "verifying" ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void verify(); }}><div><Label htmlFor="totp-code">Six-digit code</Label><Input id="totp-code" className="mt-2 text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0,6))} disabled={mode === "verifying"} /></div><Button className="w-full" type="submit" disabled={mode === "verifying" || code.length !== 6}>{mode === "verifying" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{mode === "verifying" ? "Verifying…" : "Verify and continue"}</Button></form> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Authenticator setup needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    </div>
  );
}
