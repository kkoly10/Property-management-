"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { PaymentConnectionItem } from "@/lib/data/payment-connections";

const statusPresentation = {
  not_connected: { label: "Not connected", variant: "neutral" as const, description: "Connect this entity before residents can pay online." },
  pending: { label: "Onboarding incomplete", variant: "warning" as const, description: "Stripe still needs onboarding details from this operating entity." },
  requirements_due: { label: "Requirements due", variant: "warning" as const, description: "Continue Stripe verification to resolve the required fields." },
  enabled: { label: "Enabled", variant: "success" as const, description: "Stripe can accept charges and send payouts for this entity." },
  restricted: { label: "Restricted", variant: "warning" as const, description: "Stripe has restricted this account. Review the provider requirements." },
  disabled: { label: "Checkout disabled", variant: "neutral" as const, description: "Online checkout is disabled for this entity." },
};

const requirementLabel = (value: string) => value.replaceAll("_", " ").replaceAll(".", " › ");

export function PaymentConnectionPanel({ items, authenticatorLevel, setupMode = false }: {
  items: PaymentConnectionItem[];
  authenticatorLevel: "aal1" | "aal2";
  setupMode?: boolean;
}) {
  const [selectedEntityId, setSelectedEntityId] = useState(items[0]?.operatingEntityId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const item = items.find(({ operatingEntityId }) => operatingEntityId === selectedEntityId) ?? items[0];

  if (!item) return <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Create an operating entity before connecting Stripe.</p>;

  const presentation = statusPresentation[item.status];
  const requirements = [...new Set([...item.requirements.pastDue, ...item.requirements.currentlyDue])];
  const actionLabel = item.status === "not_connected" ? "Connect Stripe" : item.status === "enabled" ? "Review in Stripe" : "Continue verification";

  async function startOnboarding() {
    if (item.status === "enabled") {
      window.open("https://dashboard.stripe.com/", "_blank", "noopener,noreferrer");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.search = "";
      const response = await fetch("/api/v1/payment-connections/stripe/onboarding-link", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": requestKey.current },
        body: JSON.stringify({
          organizationId: item.organizationId,
          operatingEntityId: item.operatingEntityId,
          returnUrl: `${currentUrl.toString()}?stripe=return`,
          refreshUrl: `${currentUrl.toString()}?stripe=refresh`,
        }),
      });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "Stripe onboarding could not start.");
      window.location.assign(body.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stripe onboarding could not start.");
      requestKey.current = crypto.randomUUID();
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {items.length > 1 ? (
        <label className="block max-w-sm text-sm font-medium">
          Operating entity
          <NativeSelect className="mt-2" value={item.operatingEntityId} onChange={(event) => { setSelectedEntityId(event.target.value); setError(null); requestKey.current = crypto.randomUUID(); }}>
            {items.map((option) => <option key={option.operatingEntityId} value={option.operatingEntityId}>{option.entityDisplayName} · {option.countryCode}</option>)}
          </NativeSelect>
        </label>
      ) : null}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{item.entityDisplayName}</p>
            <Badge variant={presentation.variant}>{presentation.label}</Badge>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.countryCode} · {item.providerAccountReference ?? "No Stripe account"}</p>
          <p className="mt-3 text-sm leading-5 text-muted-foreground">{presentation.description}</p>
        </div>
        {setupMode ? <Button disabled>Connect Stripe <ExternalLink className="h-4 w-4" /></Button>
          : authenticatorLevel !== "aal2" ? <Button asChild><Link href="/settings/security/mfa?returnTo=%2Fsettings%2Fpayments"><ShieldCheck className="h-4 w-4" />Verify with MFA</Link></Button>
          : <Button onClick={startOnboarding} disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}{submitting ? "Opening Stripe…" : actionLabel}</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Charges</p><p className="mt-1 font-semibold">{item.chargesEnabled ? "Enabled" : "Not enabled"}</p></div>
        <div className="rounded-lg border bg-muted/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payouts</p><p className="mt-1 font-semibold">{item.payoutsEnabled ? "Enabled" : "Not enabled"}</p></div>
      </div>

      {requirements.length > 0 ? <div className="rounded-lg border border-[#fedf89] bg-[#fffaeb] p-4"><p className="text-sm font-semibold text-warning">Required by Stripe</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{requirements.map((requirement) => <li key={requirement}>• {requirementLabel(requirement)}</li>)}</ul></div> : null}
      {item.requirements.pendingVerification.length > 0 ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Stripe is verifying {item.requirements.pendingVerification.length} submitted {item.requirements.pendingVerification.length === 1 ? "item" : "items"}.</p> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Connection unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {setupMode ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Add Supabase and Stripe sandbox credentials to enable the live connection command.</p> : null}
    </div>
  );
}
