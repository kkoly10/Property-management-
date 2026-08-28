import Link from "next/link";
import { ArrowRight, CircleAlert, FileCheck2, FileWarning, Plus, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getImportCenterState } from "@/lib/data/imports";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

function badgeVariant(status: string): "success" | "warning" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "warning";
  if (status === "ready") return "info";
  return "neutral";
}

export default async function ImportsPage() {
  const organizationId = await getActiveOrganizationId();
  const center = await getImportCenterState(organizationId);
  const completed = center.jobs.filter((job) => job.status === "completed").length;
  const needsAttention = center.jobs.filter((job) => job.status === "mapping" || job.status === "failed").length;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">Portfolio migration</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Import center</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Stage CSV data, resolve row errors, and commit properties and units as one replay-safe batch.</p></div><Button asChild><Link href="/app/imports/new"><Plus className="h-4 w-4" />New import</Link></Button></div>
      {center.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Import center preview</AlertTitle><AlertDescription>Connect Supabase and apply the portfolio-import migration to load live jobs.</AlertDescription></Alert> : null}
      {center.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Imports unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {center.requestId}.</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Upload className="h-5 w-5" /></span><div><p className="font-mono text-2xl font-semibold">{center.jobs.length}</p><p className="text-sm text-muted-foreground">Import jobs</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FileCheck2 className="h-5 w-5" /></span><div><p className="font-mono text-2xl font-semibold">{completed}</p><p className="text-sm text-muted-foreground">Completed</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fffaeb] text-warning"><FileWarning className="h-5 w-5" /></span><div><p className="font-mono text-2xl font-semibold">{needsAttention}</p><p className="text-sm text-muted-foreground">Needs attention</p></div></CardContent></Card></div>
      {center.jobs.length ? <Card className="overflow-hidden"><div className="divide-y">{center.jobs.map((job) => <Link key={job.id} href={`/app/imports/${job.id}`} className="flex flex-col gap-4 p-5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Upload className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{job.sourceTitle}</span><Badge variant={badgeVariant(job.status)}>{job.status}</Badge></span><span className="mt-1 block text-sm text-muted-foreground">{job.totals.rows} rows · {job.totals.creates} creates · {job.totals.errors} errors</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></Card> : <Card><CardContent className="py-16 text-center"><Upload className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No imports yet</h2><p className="mt-2 text-sm text-muted-foreground">Start with a scanned portfolio CSV.</p><Button asChild className="mt-6"><Link href="/app/imports/new">Start import</Link></Button></CardContent></Card>}
    </div>
  );
}
