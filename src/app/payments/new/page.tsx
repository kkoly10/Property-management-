import Link from "next/link";
import { ArrowLeft, CircleAlert, Clock3, RotateCcw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/crecy/page-header";
import { LivingShell } from "@/components/living/living-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getResidentPaymentRetryContext, getResidentPaymentSessionOptions } from "@/lib/data/finance";
import { ResidentPaymentForm } from "./resident-payment-form";

export const dynamic = "force-dynamic";

export default async function NewResidentPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; retry?: string }>;
}) {
  const { payment, retry: retryPaymentId } = await searchParams;
  const [workspace, retryResult] = await Promise.all([
    getResidentPaymentSessionOptions(),
    retryPaymentId
      ? getResidentPaymentRetryContext(retryPaymentId)
      : Promise.resolve({ mode: "not_found" as const, retry: undefined, requestId: undefined }),
  ]);

  return (
    <LivingShell maxWidth="max-w-3xl">
      <div className="space-y-6">
        <PageHeader
          context={
            <Link href="/home" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Home
            </Link>
          }
          title="Make a payment"
          description="Choose the charges you want to pay, confirm the method, and review the authorization before opening secure checkout."
        />

        {payment === "returned" ? (
          <Alert variant="info">
            <Clock3 aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Payment submitted for confirmation</AlertTitle>
            <AlertDescription>Returning from Stripe does not confirm payment. Card updates usually arrive quickly; bank payments can remain pending for several business days. Your balance changes only after Stripe confirms the funds.</AlertDescription>
          </Alert>
        ) : null}
        {payment === "canceled" ? (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Checkout canceled</AlertTitle>
            <AlertDescription>No payment was confirmed. You can review the amount and try again.</AlertDescription>
          </Alert>
        ) : null}
        {retryResult.retry ? (
          <Alert variant="warning">
            <RotateCcw aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Start a new attempt for {retryResult.retry.publicReference}</AlertTitle>
            <AlertDescription>The previous checkout ended without a confirmed payment. We prefilled the still-available charges below; reviewing and submitting creates a new payment attempt.</AlertDescription>
          </Alert>
        ) : null}
        {retryPaymentId && retryResult.mode === "not_found" ? (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>This payment cannot be retried</AlertTitle>
            <AlertDescription>It may still be processing, may already be complete, or the open charges may have changed. You can start a separate payment below.</AlertDescription>
          </Alert>
        ) : null}
        {retryPaymentId && retryResult.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Retry details unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {retryResult.requestId}.</AlertDescription>
          </Alert>
        ) : null}
        {workspace.mode === "setup" ? (
          <Alert variant="info">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Payment preview</AlertTitle>
            <AlertDescription>This screen uses sample charges until Supabase and Stripe sandbox credentials are connected.</AlertDescription>
          </Alert>
        ) : null}
        {workspace.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Payment options unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        <ResidentPaymentForm
          options={workspace.options}
          retry={retryResult.retry}
          disabled={workspace.mode !== "ready"}
        />
      </div>
    </LivingShell>
  );
}
