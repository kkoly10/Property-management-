import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { billingWorkspaceSchema, type BillingInterval, type PaidPlan } from "@/lib/billing/platform-contract";
import { getPlatformStripeConfig } from "@/lib/billing/platform-stripe";
import { PLAN_LABELS, PLAN_ORDER, PRICE_BOOKS, formatPrice } from "@/lib/marketing/pricing";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { BillingPanel } from "./billing-panel";

export const dynamic = "force-dynamic";

const statusLabels = {
  trialing: "Trial",
  trial_ended: "Trial ended",
  active: "Active",
  past_due: "Payment due",
  restricted: "Restricted",
  canceled: "Canceled",
} as const;

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

export default async function BillingSettingsPage() {
  const context = await getOrganizationContext();
  if (context.state !== "active") redirect("/app");
  const supabase = await createClient();
  const result = await supabase.rpc("get_platform_billing_workspace", { p_organization_id: context.active.organizationId });
  const parsed = billingWorkspaceSchema.safeParse(result.data);
  const workspace = !result.error && parsed.success ? parsed.data : null;
  const config = getPlatformStripeConfig();
  const prices = workspace ? PRICE_BOOKS[workspace.country] : null;
  const options = workspace && config && prices
    ? (["starter", "growth", "pro"] as const).filter((plan) => {
        const difference = PLAN_ORDER.indexOf(plan) - PLAN_ORDER.indexOf(workspace.plan);
        return workspace.hasSubscription
          ? workspace.status === "active" && !workspace.cancelAtPeriodEnd && difference > 0
          : difference >= 0;
      })
        .flatMap((plan: PaidPlan) => (["month", "year"] as const)
          .filter((interval) => config.priceIds[`${workspace.country}.${plan}.${interval}`]
            && (!workspace.hasSubscription || workspace.currentInterval === interval))
          .map((interval: BillingInterval) => ({
            plan,
            interval,
            label: `${PLAN_LABELS[plan]} · ${formatPrice(prices, interval === "month" ? prices.plans[plan].monthlyMinor : prices.plans[plan].annualMinor)} ${prices.currency}/${interval}`,
          })))
    : [];

  return <main className="min-h-screen gutter-5 py-5 lg:gutter-8 lg:py-10">
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" asChild><Link href="/app"><ArrowLeft className="h-4 w-4" />Back to command center</Link></Button>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Crecy subscription</h1>
        <p className="mt-2 text-muted-foreground">{context.active.displayName}</p>
      </div>
      {workspace ? <Card>
        <CardHeader>
          <CardTitle>{PLAN_LABELS[workspace.plan]}</CardTitle>
          <CardDescription>{statusLabels[workspace.status]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspace.status === "trialing" && workspace.trialEndsAt && <p>Your trial ends {dateLabel(workspace.trialEndsAt)}.</p>}
          {workspace.cancelAtPeriodEnd && workspace.periodEndsAt && <p>Your subscription ends {dateLabel(workspace.periodEndsAt)}.</p>}
          {workspace.hasSubscription && workspace.status !== "active" && <p>Open the billing portal to review your payment and invoices.</p>}
          <BillingPanel organizationId={context.active.organizationId} options={options} workspace={workspace} sandboxEnabled={Boolean(config)} />
        </CardContent>
      </Card> : <Alert variant="info">
        <AlertTitle>Billing details are unavailable</AlertTitle>
        <AlertDescription>Use an organization owner or administrator account to see subscription details.</AlertDescription>
      </Alert>}
      <Link className="inline-block text-sm font-medium text-primary hover:underline" href="/settings/payments">Rent payment connections</Link>
    </div>
  </main>;
}
