"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const claim = z.object({ agreementId: z.uuid(), claimed: z.literal(true), replayed: z.boolean() });

export function AgreementClaim({ agreementId }: { agreementId?: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "mail" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      const fragment = window.location.hash;
      const parameters = new URLSearchParams(fragment.slice(1));
      const raw = parameters.get("token");
      const proof = parameters.get("sign_in");
      if (fragment) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (agreementId && (!fragment || (proof && proof.length <= 1100 && parameters.getAll("sign_in").length === 1))) {
        if (proof) setSignIn(proof);
        setState("ready");
      } else if (!agreementId && raw && /^[0-9a-f]{64}$/.test(raw) && parameters.getAll("token").length === 1) {
        setToken(raw);
        setState("ready");
      } else {
        setState("error");
        setMessage("Open the signing invitation from your email. If the link has expired, contact your landlord for a new invitation.");
      }
    });
    return () => { disposed = true; };
  }, [agreementId]);

  async function open() {
    if (inFlight.current || (!agreementId && !token)) return;
    inFlight.current = true;
    setState("busy");
    setMessage("");
    try {
      const response = await fetch("/api/v1/rental-agreements/claim?surface=participant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agreementId ? (signIn ? { agreementId, signIn } : { agreementId }) : { token }),
      });
      const data = await response.json();
      const receipt = claim.safeParse(data);
      if (response.ok && receipt.success && (!agreementId || receipt.data.agreementId === agreementId)) {
        setToken(null);
        setSignIn(null);
        router.replace(`/documents/agreements/${receipt.data.agreementId}`);
        return;
      }
      if (response.status === 202 && data?.emailRequested === true && !agreementId) {
        setState("mail");
        setMessage("Check the email address you used to apply for a Crecy sign-in link. You can open it on a different device.");
        return;
      }
      setState("error");
      setMessage(response.status === 404
        ? signIn
          ? "This sign-in link is unavailable. Open the first invitation in a private browser window to request another sign-in email. If the invitation expired, contact your landlord."
          : "This invitation may have expired, or you may be signed in with a different email. Open the invitation in a private browser window to use the email from your application. If the link has expired, contact your landlord for a new invitation."
        : "Signing access could not be confirmed. Try again in a minute.");
    } catch {
      setState("error");
      setMessage("Signing access could not be confirmed. Try again in a minute.");
    } finally {
      inFlight.current = false;
    }
  }

  return <div className="mx-auto max-w-xl space-y-4">
    <h1 className="text-3xl font-semibold tracking-tight">Open your rental agreement</h1>
    <p className="text-sm text-muted-foreground">Use the verified email from your application to review and sign this agreement.</p>
    {state === "loading" && <p role="status">Preparing your invitation…</p>}
    {message && <p role={state === "error" ? "alert" : "status"} className="text-sm">{message}</p>}
    {state !== "loading" && (token || agreementId) && <Button type="button" disabled={state === "busy"} onClick={() => void open()}>
      {state === "busy" ? "Checking access…" : state === "mail" ? "Request another sign-in link" : "Continue to agreement"}
    </Button>}
    <p><Link className="text-sm underline" href="/documents/agreements">My rental agreements</Link></p>
  </div>;
}
