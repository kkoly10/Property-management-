import Link from "next/link";
import { ArrowLeft, CircleAlert, FileCheck2 } from "lucide-react";
import { CreateImportForm } from "../create-import-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getImportCenterState } from "@/lib/data/imports";

export const dynamic = "force-dynamic";

export default async function NewImportPage() {
  const center = await getImportCenterState();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/app/imports"><ArrowLeft className="h-4 w-4" />Import center</Link></Button>
      <div><p className="text-sm font-semibold text-primary">Portfolio migration</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Start CSV import</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose an immutable source, map its columns, validate every row, then commit the batch atomically.</p></div>
      {center.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Import preview</AlertTitle><AlertDescription>Connect Supabase and apply the portfolio-import migration to enable this workflow.</AlertDescription></Alert> : null}
      {!center.sourceDocuments.length ? <Alert variant="warning"><FileCheck2 className="h-5 w-5" /><AlertTitle>No scanned CSV is ready</AlertTitle><AlertDescription><Link href="/app/documents" className="font-semibold underline">Upload a portfolio CSV</Link>, then return after its malware scan completes.</AlertDescription></Alert> : null}
      <Card><CardHeader><CardTitle>Import source</CardTitle><CardDescription>The original document version remains attached to the job for audit and replay protection.</CardDescription></CardHeader><CardContent><CreateImportForm organizationId={center.organizationId} sources={center.sourceDocuments} disabled={center.mode !== "ready" || !center.organizationId} /></CardContent></Card>
    </div>
  );
}
