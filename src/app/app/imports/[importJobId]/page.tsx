import Link from "next/link";
import { ArrowLeft, CircleAlert, Download, ShieldCheck } from "lucide-react";
import { ImportWorkflow } from "./import-workflow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getImportJobDetail } from "@/lib/data/imports";

export const dynamic = "force-dynamic";

function badgeVariant(status: string): "success" | "warning" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "warning";
  if (status === "ready") return "info";
  return "neutral";
}

export default async function ImportDetailPage({ params }: { params: Promise<{ importJobId: string }> }) {
  const { importJobId } = await params;
  const state = await getImportJobDetail(importJobId);
  if (!state.job) return <div className="mx-auto max-w-3xl"><Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Import not found</AlertTitle><AlertDescription>This job is unavailable or outside your organization scope. {state.requestId ? `Request ${state.requestId}.` : ""}</AlertDescription></Alert></div>;
  const job = state.job;
  const isOccupied = job.importType === "leases";
  const totals = job.summary.totals ?? { rows: 0, valid: 0, warnings: 0, errors: 0, creates: 0, updates: 0, skips: 0 };
  const committed = job.summary.commitResponse?.committed;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/app/imports"><ArrowLeft className="h-4 w-4" />Import center</Link></Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-primary">{isOccupied ? "Occupied lease import" : "Portfolio import"}</p><Badge variant={badgeVariant(job.status)}>{job.status}</Badge></div><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">{job.sourceTitle}</h1><p className="mt-2 text-sm text-muted-foreground">Original source retained · Job <span className="font-mono">{job.id.slice(0, 8)}</span></p></div><Button asChild variant="outline"><Link href={`/api/v1/documents/${job.sourceDocumentId}/download`}><Download className="h-4 w-4" />Original CSV</Link></Button></div>
      {state.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Import workflow preview</AlertTitle><AlertDescription>Connect Supabase and apply the import migration to validate and commit live rows.</AlertDescription></Alert> : null}
      {job.errorMessage ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Last commit failed safely</AlertTitle><AlertDescription>{job.errorMessage} No partial rows were retained.</AlertDescription></Alert> : null}
      {job.status === "completed" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Import completed</AlertTitle><AlertDescription>{isOccupied ? `${committed?.tenancies ?? 0} tenancies were activated with ${committed?.openingBalances ?? 0} opening balances.` : `${committed?.properties ?? 0} properties and ${committed?.units ?? 0} units were committed.`} The report document is retained with this job.</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-4"><Card><CardContent className="p-5"><p className="font-mono text-2xl font-semibold">{totals.rows}</p><p className="text-sm text-muted-foreground">Rows</p></CardContent></Card><Card><CardContent className="p-5"><p className="font-mono text-2xl font-semibold text-success">{totals.valid}</p><p className="text-sm text-muted-foreground">Valid</p></CardContent></Card><Card><CardContent className="p-5"><p className="font-mono text-2xl font-semibold text-primary">{totals.creates}</p><p className="text-sm text-muted-foreground">Creates</p></CardContent></Card><Card><CardContent className="p-5"><p className="font-mono text-2xl font-semibold text-destructive">{totals.errors}</p><p className="text-sm text-muted-foreground">Error rows</p></CardContent></Card></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-hidden"><CardHeader className="flex-row items-start justify-between"><div><CardTitle>Row review</CardTitle><CardDescription>Errors are blocking; clean rows are a preview until commit.</CardDescription></div>{totals.errors ? <Button asChild variant="outline" size="sm"><Link href={`/api/v1/imports/${job.id}/errors`}><Download className="h-4 w-4" />Error CSV</Link></Button> : null}</CardHeader><div className="divide-y border-t">{job.rows.map((row) => <div key={row.row} className="p-5"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs">{row.row}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{row.source["Property Name"] ?? row.source["property_name"] ?? Object.values(row.source)[0] ?? "Row"}</p><p className="mt-1 truncate text-sm text-muted-foreground">{Object.entries(row.source).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>{row.errors.map((error) => <p key={`${error.field}-${error.code}`} className="mt-2 text-sm font-medium text-destructive">{error.field ? `${error.field}: ` : ""}{error.message}</p>)}</div>{row.action ? <Badge variant={row.action === "error" ? "warning" : row.action === "skip" ? "neutral" : "info"}>{row.action.replaceAll("_", " ")}</Badge> : null}</div></div>)}</div></Card>
        <Card className="h-fit"><CardHeader><CardTitle>Column mapping</CardTitle><CardDescription>Required fields must map to one source column before validation.</CardDescription></CardHeader><CardContent><ImportWorkflow jobId={job.id} importType={job.importType} headers={job.sourceHeaders} currentMapping={job.mapping.columns ?? {}} currentOptions={job.mapping.options} status={job.status} validationHash={job.validationHash} disabled={state.mode !== "ready"} /></CardContent></Card>
      </div>
    </div>
  );
}
