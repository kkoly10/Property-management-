"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { closeoutReceipt, type CloseoutCommand, type TenancyCloseout } from "@/lib/validation/tenancy-closeout";

const stateLabel = {
  open: "Open",
  planned: "Handback planned",
  canceled: "Plan canceled",
  returned: "Possession returned",
} as const;

export function formatBalance(amountMinor: string, currency: string) {
  const minor = BigInt(amountMinor);
  const magnitude = minor < 0 ? -minor : minor;
  const minorUnitsPerMajor = BigInt(100);
  return new Intl.NumberFormat("en-US", { style: "currency", currency })
    .formatToParts(magnitude / minorUnitsPerMajor)
    .map((part) => part.type === "fraction" ? (magnitude % minorUnitsPerMajor).toString().padStart(2, "0") : part.value)
    .join("");
}

export function TenancyCloseoutView({ closeout, organizationId }: { closeout: TenancyCloseout; organizationId: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [receipt, setReceipt] = useState(closeoutReceipt.parse(closeout));
  const [pending, setPending] = useState<CloseoutCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [planOn, setPlanOn] = useState(closeout.plannedReturnOn ?? closeout.localToday);
  const [returnOn, setReturnOn] = useState(closeout.localToday);
  const [confirmed, setConfirmed] = useState(false);
  const current = closeout.version > receipt.version ? closeout : receipt;
  const canChange = closeout.canManage && current.state !== "returned"
    && closeout.tenancyStatus !== "closed" && closeout.tenancyStatus !== "scheduled";
  const planMinimum = closeout.possessionStart > closeout.localToday ? closeout.possessionStart : closeout.localToday;

  async function send(command: CloseoutCommand) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPending(command);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/tenancies/${closeout.tenancyId}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = await response.json();
      const result = closeoutReceipt.safeParse(data);
      if (response.ok && result.success && result.data.tenancyId === closeout.tenancyId) {
        setReceipt(result.data);
        setPending(null);
        setMessage({ error: false, text: stateLabel[result.data.state] + "." });
        router.refresh();
      } else if (response.status >= 400 && response.status < 500) {
        setPending(null);
        if ([401, 404, 409].includes(response.status)) setNeedsReload(true);
        setMessage({ error: true, text: typeof data?.error === "string" ? data.error : "Check the requested closeout action." });
      } else {
        setMessage({ error: true, text: "The result could not be confirmed. Retry the same request." });
      }
    } catch {
      setMessage({ error: true, text: "The result could not be confirmed. Retry the same request." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const commandScope = () => ({ organizationId, expectedVersion: current.version, idempotencyKey: crypto.randomUUID() });
  function plan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send({ ...commandScope(), action: "plan", effectiveOn: planOn });
  }
  function recordReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed) void send({ ...commandScope(), action: "record_return", effectiveOn: returnOn, returnConfirmed: true });
  }

  return <div className="max-w-3xl space-y-6">
    <header className="space-y-3">
      <Link className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        href={`/app/properties/${closeout.propertyId}#residents`}>Back to property tenancies</Link>
      <h1 className="text-3xl font-semibold tracking-tight">Tenancy closeout</h1>
      <p className="break-words text-muted-foreground">{closeout.householdName} · {closeout.propertyName} · {closeout.unitCode}</p>
      <Button asChild variant="outline"><Link href={`/app/tenancies/${closeout.tenancyId}/renewal`}>Tenancy renewal</Link></Button>
    </header>

    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Possession and lease dates</CardTitle>
        <div><Badge variant={current.state === "returned" ? "success" : "neutral"}>{stateLabel[current.state]}</Badge></div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Recorded lease term</dt><dd>{closeout.leaseStart} to {closeout.leaseEnd ?? "open-ended"}</dd></div>
          <div><dt className="text-muted-foreground">Recorded possession start</dt><dd>{closeout.possessionStart}</dd></div>
          <div><dt className="text-muted-foreground">Planned handback</dt><dd>{current.plannedReturnOn ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Possession returned</dt><dd>{current.returnedOn ?? "—"}</dd></div>
        </dl>
        {closeout.tenancyStatus === "scheduled" && <p className="mt-4 text-sm text-muted-foreground">Closeout becomes available after this tenancy starts.</p>}
        {closeout.tenancyStatus === "closed" && current.state !== "returned"
          && <p className="mt-4 text-sm text-muted-foreground">This historical tenancy is closed. Its handback date wasn’t recorded.</p>}
      </CardContent>
    </Card>

    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.text}</p>}
    {pending && <Button variant="outline" disabled={busy} onClick={() => void send(pending)}>{busy ? "Saving…" : "Retry same request"}</Button>}
    {needsReload && <Button variant="outline" onClick={() => window.location.reload()}>Reload tenancy</Button>}

    {canChange && <Card>
      <CardHeader>
        <CardTitle>Plan a handback</CardTitle>
        <CardDescription>Use this date to track the planned handback. Rent and possession continue until you record the actual handback.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={plan}>
          <fieldset className="space-y-3" disabled={busy || !!pending || needsReload}>
            <label htmlFor="planned-handback" className="block text-sm font-medium">Planned handback date</label>
            <Input id="planned-handback" type="date" min={planMinimum} value={planOn} onChange={(event) => setPlanOn(event.target.value)} required />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{current.state === "planned" ? "Update plan" : "Save plan"}</Button>
              {current.state === "planned" && <Button type="button" variant="outline"
                onClick={() => void send({ ...commandScope(), action: "cancel" })}>Cancel plan</Button>}
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>}

    {canChange && <Card>
      <CardHeader>
        <CardTitle>Record returned possession</CardTitle>
        <CardDescription>
          Record this once the household has returned possession. The handback date is the final day of possession.
          Recording it stops future automatic rent charges for this tenancy and preserves the recorded lease term.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={recordReturn}>
          <fieldset className="space-y-3" disabled={busy || !!pending || needsReload}>
            <label htmlFor="actual-handback" className="block text-sm font-medium">Actual handback date</label>
            <Input id="actual-handback" type="date" min={closeout.possessionStart} max={closeout.localToday} value={returnOn}
              onChange={(event) => setReturnOn(event.target.value)} required />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)} required />
              I confirm the household has returned possession on the date above.
            </label>
            <Button type="submit" disabled={!confirmed}>Record handback</Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>}

    <Card>
      <CardHeader>
        <CardTitle>Final accounting review</CardTitle>
        <CardDescription>Review posted activity for this tenancy. Outstanding charges and unsettled payments can still change the balance.</CardDescription>
      </CardHeader>
      <CardContent>
        {closeout.accounting ? <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Posted receivable balance</dt><dd className="break-words font-medium">
            {formatBalance(closeout.accounting.balanceMinor, closeout.accounting.currency)}
            {closeout.accounting.balanceMinor.startsWith("-") ? " credit"
              : closeout.accounting.balanceMinor === "0" ? "" : " owed"}
          </dd></div>
          <div><dt className="text-muted-foreground">Open charges</dt><dd>{closeout.accounting.openCharges}</dd></div>
          <div><dt className="text-muted-foreground">Pending or disputed payments</dt><dd>{closeout.accounting.unsettledPayments}</dd></div>
        </dl> : <p className="text-sm text-muted-foreground">Financial access is required to see this balance.</p>}
      </CardContent>
    </Card>
  </div>;
}
