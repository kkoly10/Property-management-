"use client";

import { useRef, useState, type ReactNode } from "react";
import { CreditCard, Landmark, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ResidentPaymentRetryContext, ResidentPaymentSessionOption } from "@/lib/data/finance";

type Method = "card" | "bank";
type SessionResponse = { checkoutUrl?: string; error?: string };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const toMinor = (value: string) => { const number = Number(value); return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };
const toMajor = (amountMinor: number) => (amountMinor / 100).toFixed(2);

function PaymentStep({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 border-b px-5 py-6 last:border-b-0 sm:grid-cols-[42px_minmax(0,1fr)] sm:px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--brand)]/25 bg-[var(--brand-subtle)] text-xs font-semibold text-[var(--brand-strong)]">
        {number}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

export function ResidentPaymentForm({ options, retry, disabled }: { options: ResidentPaymentSessionOption[]; retry?: ResidentPaymentRetryContext; disabled: boolean }) {
  const initialOption = options.find((option) => option.tenancyId === retry?.tenancyId) ?? options[0];
  const initialAllocations = Object.fromEntries((retry?.allocations ?? []).flatMap((allocation) => {
    const charge = initialOption?.charges.find((candidate) => candidate.chargeId === allocation.chargeId);
    const availableMinor = Math.min(allocation.amountMinor, charge?.remainingMinor ?? 0);
    return availableMinor > 0 ? [[allocation.chargeId, toMajor(availableMinor)]] : [];
  }));
  const initialAmountMinor = Object.values(initialAllocations).reduce((total, value) => total + (toMinor(value) ?? 0), 0);
  const initialMethod = retry && initialOption?.availableMethods.includes(retry.method) ? retry.method : initialOption?.availableMethods[0] ?? "card";
  const [tenancyId, setTenancyId] = useState(initialOption?.tenancyId ?? "");
  const selected = options.find((option) => option.tenancyId === tenancyId);
  const [amount, setAmount] = useState(initialAmountMinor > 0 ? toMajor(initialAmountMinor) : "");
  const [allocations, setAllocations] = useState<Record<string, string>>(initialAllocations);
  const [method, setMethod] = useState<Method>(initialMethod);
  const [authorized, setAuthorized] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const amountMinor = toMinor(amount);
  const parsedAllocations = Object.entries(allocations).flatMap(([chargeId, value]) => {
    const allocationMinor = toMinor(value);
    return allocationMinor && allocationMinor > 0 ? [{ chargeId, amountMinor: allocationMinor }] : [];
  });
  const allocatedMinor = parsedAllocations.reduce((total, allocation) => total + allocation.amountMinor, 0);

  function changed() {
    idempotencyKey.current = null;
    setReviewing(false);
    setError(null);
  }

  function selectTenancy(nextTenancyId: string) {
    const next = options.find((option) => option.tenancyId === nextTenancyId);
    setTenancyId(nextTenancyId);
    setAmount("");
    setAllocations({});
    setMethod(next?.availableMethods[0] ?? "card");
    setAuthorized(false);
    changed();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || disabled) return;
    if (!amountMinor || amountMinor !== allocatedMinor) {
      setError("Allocate the full payment amount across one or more charges.");
      return;
    }
    if (parsedAllocations.some((allocation) => allocation.amountMinor > (selected.charges.find((charge) => charge.chargeId === allocation.chargeId)?.remainingMinor ?? 0))) {
      setError("An allocation is greater than the remaining charge amount.");
      return;
    }
    if (!selected.availableMethods.includes(method)) {
      setError("That payment method is not available for this home.");
      return;
    }
    if (!authorized) {
      setError("Review and accept the payment authorization before continuing.");
      return;
    }
    if (!reviewing) {
      setReviewing(true);
      setError(null);
      return;
    }

    setPending(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/resident-payment-sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          tenancyId,
          amountMinor,
          currencyCode: selected.currencyCode,
          allocationPreference: parsedAllocations,
          methodPreference: method,
          returnUrl: `${window.location.origin}/payments/new`,
        }),
      });
      const body = await response.json() as SessionResponse;
      if (!response.ok || !body.checkoutUrl) {
        if (response.status !== 503) idempotencyKey.current = null;
        throw new Error(body.error ?? "Checkout could not be opened.");
      }
      window.location.assign(body.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not be opened.");
      setPending(false);
    }
  }

  if (!options.length) {
    return (
      <Alert variant="warning">
        <Landmark aria-hidden="true" className="h-5 w-5" />
        <AlertTitle>No payable charges</AlertTitle>
        <AlertDescription>There are no eligible open charges for an active resident tenancy. If this looks wrong, contact your property manager.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="overflow-hidden rounded-[1.1rem] border bg-card shadow-[0_1px_2px_rgba(16,24,40,.03)]">
        <PaymentStep
          number="01"
          title="Amount and charges"
          description="Choose the home and apply the payment to the exact open charges."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resident-payment-tenancy">Home</Label>
              <NativeSelect id="resident-payment-tenancy" value={tenancyId} disabled={disabled || pending} onChange={(event) => selectTenancy(event.target.value)}>
                {options.map((option) => <option key={option.tenancyId} value={option.tenancyId}>{option.propertyName} · Unit {option.unitCode}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resident-payment-amount">Payment amount ({selected?.currencyCode})</Label>
              <Input id="resident-payment-amount" required inputMode="decimal" placeholder="500.00" value={amount} disabled={disabled || pending} onChange={(event) => { setAmount(event.target.value); changed(); }} />
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[minmax(0,1fr)_120px] border-b bg-[var(--surface-subtle)] px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Open charge</span>
              <span>Apply</span>
            </div>
            <div className="divide-y">
              {selected?.charges.map((charge) => (
                <div key={charge.chargeId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                  <div>
                    <p className="text-sm font-semibold">{charge.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Due {charge.dueDate} · {money(charge.remainingMinor, selected.currencyCode)} remaining</p>
                  </div>
                  <div>
                    <Label className="sr-only" htmlFor={`resident-allocation-${charge.chargeId}`}>Apply to {charge.description}</Label>
                    <Input id={`resident-allocation-${charge.chargeId}`} inputMode="decimal" placeholder="0.00" value={allocations[charge.chargeId] ?? ""} disabled={disabled || pending} onChange={(event) => { setAllocations((current) => ({ ...current, [charge.chargeId]: event.target.value })); changed(); }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t bg-[var(--brand-subtle)] px-4 py-3 text-sm">
              <span className="text-muted-foreground">Allocated</span>
              <span data-financial-value className="font-semibold">{money(allocatedMinor, selected?.currencyCode ?? "USD")} / {money(amountMinor ?? 0, selected?.currencyCode ?? "USD")}</span>
            </div>
          </div>
        </PaymentStep>

        <PaymentStep
          number="02"
          title="Payment method"
          description="Methods are determined by the property’s connected Stripe account."
        >
          <div className="divide-y overflow-hidden rounded-xl border">
            {selected?.availableMethods.map((availableMethod) => {
              const Icon = availableMethod === "card" ? CreditCard : Landmark;
              const active = method === availableMethod;
              return (
                <label key={availableMethod} className={`grid cursor-pointer grid-cols-[auto_24px_minmax(0,1fr)] items-start gap-3 px-4 py-4 transition-colors ${active ? "bg-[var(--brand-subtle)]" : "bg-card hover:bg-muted/30"}`}>
                  <input className="mt-1" type="radio" name="payment-method" value={availableMethod} checked={active} disabled={disabled || pending} onChange={() => { setMethod(availableMethod); changed(); }} />
                  <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span>
                    <span className="block text-sm font-semibold">{availableMethod === "card" ? "Debit or credit card" : "Bank account"}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{availableMethod === "card" ? "Confirmation is usually quick." : "Confirmation can take several business days."}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {selected && !selected.availableMethods.length ? (
            <Alert className="mt-4" variant="warning">
              <Landmark aria-hidden="true" className="h-5 w-5" />
              <AlertTitle>Online payments unavailable</AlertTitle>
              <AlertDescription>Your property manager’s payment connection is not ready to accept this currency and method yet.</AlertDescription>
            </Alert>
          ) : null}
        </PaymentStep>

        <PaymentStep
          number="03"
          title="Authorization"
          description="Crecy does not add a resident surcharge and does not hold rent funds."
        >
          <label className="flex items-start gap-3 rounded-xl bg-[var(--surface-subtle)] p-4 text-sm leading-6">
            <input className="mt-1.5" type="checkbox" checked={authorized} disabled={disabled || pending} onChange={(event) => { setAuthorized(event.target.checked); changed(); }} />
            <span>I authorize this payment to the property’s connected Stripe account. I understand the payment remains pending until Stripe confirms it and that bank payments may take several business days.</span>
          </label>
          <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            Stripe securely collects the payment credentials. Crecy does not store full card or bank details.
          </p>
        </PaymentStep>
      </div>

      {reviewing ? (
        <Alert variant="warning">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Final review</AlertTitle>
          <AlertDescription>You’re about to open Stripe Checkout for {money(amountMinor ?? 0, selected?.currencyCode ?? "USD")}. Returning to Crecy is not proof of payment; provider confirmation controls the final status.</AlertDescription>
        </Alert>
      ) : null}

      {error ? <Alert variant="destructive"><AlertTitle>Payment stopped</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Button className="w-full" size="lg" disabled={disabled || pending || !selected?.availableMethods.length}>
        {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LockKeyhole aria-hidden="true" className="h-4 w-4" />}
        {pending ? "Opening secure checkout…" : reviewing ? "Continue to Stripe" : "Review payment"}
      </Button>
    </form>
  );
}
