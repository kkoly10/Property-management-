import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getResidentMaintenanceWorkspace } from "@/lib/data/maintenance";
import { MaintenanceRequestForm } from "./maintenance-request-form";

export const dynamic = "force-dynamic";

export default async function NewMaintenanceRequestPage() {
  const workspace = await getResidentMaintenanceWorkspace();
  return <div className="min-h-screen bg-[#f6f8fb] pb-12">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Living</Badge></div></header>
    <main className="mx-auto max-w-3xl space-y-6 p-5 sm:py-8">
      <div><Button asChild size="sm" variant="ghost"><Link href="/maintenance"><ArrowLeft className="h-4 w-4" />Maintenance</Link></Button><h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">Report a maintenance issue</h1><p className="mt-2 text-sm text-muted-foreground">Share what is happening, add photos, and tell the property team when they can visit.</p></div>
      {workspace.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Maintenance preview</AlertTitle><AlertDescription>This sample shows the intake experience until Supabase is connected.</AlertDescription></Alert> : null}
      {workspace.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Maintenance unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {workspace.requestId}.</AlertDescription></Alert> : null}
      <Card><CardHeader><CardTitle>Issue details</CardTitle><CardDescription>Your text is saved on this device as you work. Photos are uploaded only when you submit.</CardDescription></CardHeader><CardContent><MaintenanceRequestForm tenancies={workspace.tenancies} disabled={workspace.mode !== "ready"} /></CardContent></Card>
    </main>
  </div>;
}
