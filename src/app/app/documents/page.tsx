import Link from "next/link";
import { CircleAlert, Download, FileCheck2, FileClock, FileText, ShieldCheck } from "lucide-react";
import { DocumentUploadForm } from "./document-upload-form";
import { DocumentDeliverForm } from "./document-deliver-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentCenterState } from "@/lib/data/documents";
import { getActiveOrganizationId } from "@/lib/organization/context";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export default async function DocumentsPage() {
  const organizationId = await getActiveOrganizationId();
  const center = await getDocumentCenterState(organizationId);
  const cleanCount = center.documents.filter((document) => document.uploadStatus === "clean").length;
  const pendingCount = center.documents.filter((document) => ["quarantined", "scanning"].includes(document.uploadStatus)).length;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div><p className="text-sm font-semibold text-primary">Records</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Documents</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Upload operator-controlled files through a private, checksummed quarantine before they enter an active workflow.</p></div>
      {center.mode === "setup" ? <Alert variant="info"><CircleAlert className="h-5 w-5" /><AlertTitle>Document center preview</AlertTitle><AlertDescription>Connect Supabase and apply the document-ingestion migration to enable private uploads.</AlertDescription></Alert> : null}
      {center.mode === "error" ? <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Documents unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {center.requestId}.</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><FileText className="h-5 w-5" /></span><div><p className="font-mono text-2xl font-semibold">{center.documents.length}</p><p className="text-sm text-muted-foreground">Stored records</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FileCheck2 className="h-5 w-5" /></span><div><p className="font-mono text-2xl font-semibold">{cleanCount}</p><p className="text-sm text-muted-foreground">Scanned clean</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fffaeb] text-warning"><FileClock className="h-5 w-5" /></span><div><p className="font-mono text-2xl font-semibold">{pendingCount}</p><p className="text-sm text-muted-foreground">In quarantine</p></div></CardContent></Card></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden"><CardHeader><CardTitle>Document register</CardTitle><CardDescription>Downloads stay unavailable until the current version passes malware scanning.</CardDescription></CardHeader>{center.documents.length ? <div className="divide-y border-t">{center.documents.map((document) => <div key={document.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><FileText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{document.title}</p><Badge variant={document.uploadStatus === "clean" ? "success" : document.uploadStatus === "rejected" ? "warning" : "info"}>{document.uploadStatus === "quarantined" ? "Scan pending" : document.uploadStatus}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{document.propertyName ?? "Organization-wide"} · v{document.versionNumber} · {document.originalFilename} · {formatBytes(document.sizeBytes)}</p><p className="mt-2 text-xs font-medium text-warning">Operator supplied — legal sufficiency not verified by Crecy.</p></div>{document.uploadStatus === "clean" ? <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end"><Button asChild variant="outline" size="sm"><Link href={`/api/v1/documents/${document.id}/download`}><Download className="h-4 w-4" />Download</Link></Button><DocumentDeliverForm organizationId={center.organizationId ?? ""} documentVersionId={document.versionId} documentTitle={document.title} recipients={center.recipients} disabled={center.mode !== "ready"} /></div> : <Button variant="outline" size="sm" disabled><ShieldCheck className="h-4 w-4" />Await scan</Button>}</div>)}</div> : <CardContent className="border-t py-14 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No documents yet</h2><p className="mt-2 text-sm text-muted-foreground">Your verified upload register will appear here.</p></CardContent>}</Card>
        <Card className="h-fit"><CardHeader><CardTitle>Upload document</CardTitle><CardDescription>Files are private and immutable after finalization.</CardDescription></CardHeader><CardContent><DocumentUploadForm organizationId={center.organizationId} properties={center.properties} disabled={center.mode !== "ready" || !center.organizationId} /></CardContent></Card>
      </div>
    </div>
  );
}
