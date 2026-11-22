"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BillingInterval, BillingWorkspace, PaidPlan } from "@/lib/billing/platform-contract";

type Option = { plan: PaidPlan; interval: BillingInterval; label: string };

export function BillingPanel({ organizationId, options, workspace }: {
  organizationId: string;
  options: Option[];
  workspace: BillingWorkspace;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const visible = workspace.checkoutPending
    ? options.filter((item) => item.plan === workspace.pendingPlan && item.interval === workspace.pendingInterval)
    : options;
  const canChooseFree = workspace.plan === "growth" && ["trialing", "trial_ended"].includes(workspace.status)
    && !workspace.checkoutPending && !workspace.hasSubscription && !workspace.portalAvailable;

  async function start(kind: "portal" | "subscription-changes", body?: { targetPlanCode: PaidPlan | "free"; billingInterval: BillingInterval }) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/v1/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...body }),
      });
      const result = await response.json() as { code?: string; error?: string; status?: string; url?: string };
      if (result.code === "MFA_REQUIRED") {
        window.location.assign("/settings/security/mfa?returnTo=%2Fsettings%2Fbilling");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Billing is temporarily unavailable.");
      if (result.status === "free") {
        window.location.reload();
        return;
      }
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      if (result.status === "awaiting_confirmation") {
        setMessage("Stripe received your checkout. Refresh for the confirmed subscription status.");
        return;
      }
      throw new Error("Billing is temporarily unavailable.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Billing is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = new FormData(event.currentTarget).get("plan");
    const option = visible.find(({ plan, interval }) => `${plan}.${interval}` === selected);
    if (option) void start("subscription-changes", { targetPlanCode: option.plan, billingInterval: option.interval });
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Stripe sandbox. Use test payment details only.</p>
    {!workspace.hasSubscription && visible.length > 0 && <form className="space-y-3" onSubmit={checkout}>
      <label className="block text-sm font-medium" htmlFor="subscription-plan">Plan and billing period</label>
      <div className="flex flex-wrap items-center gap-3">
        <select id="subscription-plan" name="plan" disabled={busy} className="min-h-10 max-w-full rounded-md border bg-background px-3 text-sm">
          {visible.map((item) => <option key={`${item.plan}.${item.interval}`} value={`${item.plan}.${item.interval}`}>{item.label}</option>)}
        </select>
        <Button disabled={busy}>{workspace.checkoutPending ? "Continue checkout" : "Open Stripe checkout"}</Button>
      </div>
    </form>}
    {workspace.checkoutPending && !visible.length && <p className="text-sm">The pending checkout option is unavailable. Contact support for help reconciling it.</p>}
    {canChooseFree && <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Free includes one active unit and one staff seat.</p>
      <Button type="button" variant="outline" disabled={busy}
        onClick={() => void start("subscription-changes", { targetPlanCode: "free", billingInterval: "month" })}>
        Choose Free
      </Button>
    </div>}
    {workspace.portalAvailable && <Button type="button" variant="outline" disabled={busy} onClick={() => void start("portal")}>Open billing portal</Button>}
    {message && <Alert variant={failed ? "destructive" : "info"}><AlertDescription>{message}</AlertDescription></Alert>}
  </div>;
}
