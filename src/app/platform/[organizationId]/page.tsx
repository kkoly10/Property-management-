import Link from "next/link";
import { Activity, ArrowLeft, CircleAlert, KeyRound, ShieldCheck, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupportOrganizationDiagnostics } from "@/lib/data/platform-support";
import { StartSupportSessionForm } from "../start-support-session-form";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll(".", " ").replaceAll("_", " ");

export default async function PlatformOrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const state = await getSupportOrganizationDiagnostics(organizationId);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/platform"><ArrowLeft className="h-4 w-4" />Support console</Link></Button>

      {state.mode === "forbidden" ? (
        <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Not a platform support actor</AlertTitle><AlertDescription>Ask a platform administrator to provision your account.</AlertDescription></Alert>
      ) : null}
      {state.mode === "error" ? (
        <Alert variant="destructive"><CircleAlert className="h-5 w-5" /><AlertTitle>Diagnostics unavailable</AlertTitle><AlertDescription>Refresh and try again. Request {state.requestId}.</AlertDescription></Alert>
      ) : null}

      {state.mode === "no_session" ? (
        <Card>
          <CardHeader><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><CardTitle>Open a support session</CardTitle></div><CardDescription>You need an active, audited support session for this organization before any diagnostics are shown.</CardDescription></CardHeader>
          <CardContent><StartSupportSessionForm organizationId={organizationId} disabled={false} /></CardContent>
        </Card>
      ) : null}

      {state.overview ? (
        <>
          {state.mode === "setup" ? <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertTitle>Preview diagnostics</AlertTitle><AlertDescription>Sample sanitized data shown until Supabase is connected.</AlertDescription></Alert> : null}
          <div>
            <p className="text-sm font-semibold text-primary">Sanitized diagnostics · read-only</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">{state.overview.displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{state.overview.slug} · {state.overview.status}<Badge variant="neutral">{state.overview.subscriptionPlanCode ?? "no plan"} · {state.overview.subscriptionStatus ?? "—"}</Badge></p>
          </div>

          <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Properties", value: state.overview.propertyCount },
              { label: "Units", value: state.overview.unitCount },
              { label: "Active tenancies", value: state.overview.activeTenancyCount },
              { label: "Open work orders", value: state.overview.openWorkOrderCount },
              { label: "Active members", value: state.overview.activeMemberCount },
            ].map((metric) => (
              <Card key={metric.label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-2 font-mono text-2xl font-semibold">{metric.value}</p></CardContent></Card>
            ))}
          </section>

          <Card>
            <CardHeader className="border-b"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><CardTitle>Members</CardTitle></div><CardDescription>Roles and access windows. Email addresses are masked.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {state.members.length ? <div className="divide-y">{state.members.map((member) => (
                <div key={member.membershipId} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{member.maskedEmail}</span><Badge variant="neutral">{member.roleCode}</Badge></span>
                  <Badge variant={member.status === "active" ? "success" : "neutral"}>{member.status}</Badge>
                </div>
              ))}</div> : <p className="px-5 py-6 text-center text-sm text-muted-foreground">No members.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><CardTitle>Recent activity</CardTitle></div><CardDescription>Action codes only — no record contents or before/after payloads.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {state.activity.length ? <div className="divide-y">{state.activity.map((event, index) => (
                <div key={`${event.actionCode}:${event.occurredAt}:${index}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span><span className="font-medium">{label(event.actionCode)}</span><span className="ml-2 text-xs text-muted-foreground">{event.resourceType}</span></span>
                  <span className="text-xs text-muted-foreground">{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : ""}</span>
                </div>
              ))}</div> : <p className="px-5 py-6 text-center text-sm text-muted-foreground">No recent activity.</p>}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
