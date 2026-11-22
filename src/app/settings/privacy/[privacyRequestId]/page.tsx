import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPrivacyRequestReceipt } from "@/lib/data/privacy";

export const dynamic = "force-dynamic";

const receiptDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const personalHistory = "/settings/privacy?view=personal";

export default async function PrivacyRequestReceiptPage({ params }: { params: Promise<{ privacyRequestId: string }> }) {
  const { privacyRequestId } = await params;
  if (!z.uuid().safeParse(privacyRequestId).success) notFound();

  const result = await getPrivacyRequestReceipt(privacyRequestId);
  if (result.status === "not_found") notFound();

  const returnTo = `/settings/privacy/${privacyRequestId}`;
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-6 p-5 sm:py-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href={personalHistory}><ArrowLeft className="h-4 w-4" />My privacy requests</Link>
      </Button>
      {result.status === "step_up_required" ? (
        <Card>
          <CardHeader><CardTitle>Verify your identity to open the receipt</CardTitle></CardHeader>
          <CardContent>
            <Button asChild><Link href={`/settings/security/mfa?${new URLSearchParams({ returnTo })}`}>
              <ShieldCheck className="h-4 w-4" />Use your authenticator
            </Link></Button>
          </CardContent>
        </Card>
      ) : null}
      {result.status === "unavailable" ? (
        <Alert variant="destructive">
          <AlertTitle>Receipt unavailable</AlertTitle>
          <AlertDescription>Refresh the page to try again.</AlertDescription>
        </Alert>
      ) : null}
      {result.status === "ready" ? (
        <Card>
          <CardHeader><CardTitle>Privacy request receipt</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">Request type</dt><dd className="capitalize">{result.receipt.requestType.replaceAll("_", " ")}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Status</dt><dd><Badge className="capitalize" variant="neutral">{result.receipt.status.replaceAll("_", " ")}</Badge></dd></div>
              <div><dt className="text-sm text-muted-foreground">Controller</dt><dd>{result.receipt.organizationName ?? "Crecy platform privacy team"}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Request reference</dt><dd className="break-all font-mono text-xs">{result.receipt.privacyRequestId}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Submitted (UTC)</dt><dd>{receiptDate.format(new Date(result.receipt.submittedAt))}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Identity verified (UTC)</dt><dd>{receiptDate.format(new Date(result.receipt.identityVerifiedAt))}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Target date (UTC)</dt><dd>{receiptDate.format(new Date(result.receipt.dueAt))}</dd></div>
              {result.receipt.completedAt ? (
                <div><dt className="text-sm text-muted-foreground">Closed (UTC)</dt><dd>{receiptDate.format(new Date(result.receipt.completedAt))}</dd></div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
