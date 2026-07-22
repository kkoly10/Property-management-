import Link from "next/link";
import { ArrowLeft, Camera, CalendarDays, CircleAlert, KeyRound, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getResidentMaintenanceDetail } from "@/lib/data/maintenance";

export const dynamic = "force-dynamic";
const statusLabel: Record<string, string> = { submitted: "Submitted", reviewed: "Reviewed", scheduled: "Scheduled", being_repaired: "Being repaired", waiting_for_confirmation: "Waiting for confirmation", completed: "Completed", canceled: "Canceled" };

export default async function ResidentMaintenanceDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const result = await getResidentMaintenanceDetail(requestId);
  if (!result.item && result.mode !== "error") notFound();
  const item = result.item;
  return <div className="min-h-screen bg-[#f6f8fb] pb-12"><header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5"><Wordmark /><Badge variant="info">Crecy Living</Badge></div></header><main className="mx-auto max-w-3xl space-y-6 p-5 sm:py-8">
    <Button asChild size="sm" variant="ghost"><Link href="/maintenance"><ArrowLeft className="h-4 w-4" />Maintenance</Link></Button>
    {result.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Request unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {result.requestId}.</AlertDescription></Alert> : null}
    {item ? <><div><div className="flex flex-wrap items-center gap-2"><Badge variant={item.residentVisibleStatus === "completed" ? "success" : "info"}>{statusLabel[item.residentVisibleStatus] ?? item.residentVisibleStatus}</Badge><span className="font-mono text-xs text-muted-foreground">{item.publicReference}</span></div><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">{item.title}</h1><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{item.propertyName} · Unit {item.unitCode}</p></div>
      <Card><CardHeader><CardTitle>What you reported</CardTitle><CardDescription>{item.category.replaceAll("_", " ")} · submitted {new Date(item.createdAt).toLocaleString()}</CardDescription></CardHeader><CardContent className="space-y-5"><p className="whitespace-pre-wrap text-sm leading-6">{item.description}</p><div className="flex items-center gap-2 text-sm text-muted-foreground"><Camera className="h-4 w-4" />{item.evidenceCount} {item.evidenceCount === 1 ? "photo" : "photos"} attached</div>{item.accessPermission ? <div className="rounded-lg bg-muted p-4"><p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />Access instructions</p><p className="mt-2 text-sm text-muted-foreground">{item.accessPermission}</p></div> : null}{item.preferredTimes.length ? <div className="rounded-lg bg-muted p-4"><p className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="h-4 w-4" />Preferred visit window</p><p className="mt-2 text-sm text-muted-foreground">{new Date(item.preferredTimes[0].start).toLocaleString()} – {new Date(item.preferredTimes[0].end).toLocaleString()}</p></div> : null}</CardContent></Card>
      <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>The property team will review your request</AlertTitle><AlertDescription>Your requested priority is not the official triage priority. Status changes will appear here without exposing private vendor or cost information.</AlertDescription></Alert></> : null}
  </main></div>;
}
