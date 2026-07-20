import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, CircleAlert, Landmark, Plus, Settings2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardState } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

const attentionItems = [
  { title: "Add your first property", description: "Create the property and units that belong to this accounting book.", href: "/onboarding/property", icon: Building2 },
  { title: "Connect payment processing", description: "Complete Stripe-hosted verification before enabling resident checkout.", href: "/settings/payments", icon: Landmark },
];

export default async function DashboardPage() {
  const dashboard = await getDashboardState();
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-muted-foreground">{todayLabel}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Good morning</h1><p className="mt-2 text-sm text-muted-foreground">Start with the items that need a decision or setup.</p></div>
        <Button asChild><Link href="/onboarding/entity"><Plus className="h-4 w-4" />Add operating entity</Link></Button>
      </div>
      {dashboard.mode === "setup" ? <Alert variant="warning"><Settings2 aria-hidden="true" className="h-5 w-5" /><AlertTitle>Connect Supabase to activate this workspace</AlertTitle><AlertDescription>Copy <code className="font-mono text-xs">.env.example</code> to <code className="font-mono text-xs">.env.local</code>, add the project URL and publishable key, then apply the foundation migration.</AlertDescription></Alert> : null}
      <section aria-label="Foundation summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Properties" value={dashboard.propertyCount === null ? "—" : String(dashboard.propertyCount)} detail="Tenant-scoped portfolio" />
        <MetricCard label="Active units" value={dashboard.activeUnitCount === null ? "—" : String(dashboard.activeUnitCount)} detail="Counted toward plan usage" />
        <MetricCard label="Book currencies" value={dashboard.bookCurrencies.length ? dashboard.bookCurrencies.join(" · ") : "—"} detail="No cross-currency journals" mono />
        <MetricCard label="Open exceptions" value="—" detail="Available after portfolio setup" />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between border-b"><div><CardTitle>Attention queue</CardTitle><CardDescription>Unresolved setup and operational work, ordered by impact.</CardDescription></div><Badge variant="warning">2 setup items</Badge></CardHeader>
          <CardContent className="divide-y p-0">
            {attentionItems.map(({ title, description, href, icon: Icon }) => <Link key={title} href={href} className="group flex items-start gap-4 px-6 py-5 hover:bg-muted/50"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span></span><ArrowRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b"><CardTitle>Foundation status</CardTitle><CardDescription>Security and accounting invariants already in place.</CardDescription></CardHeader>
          <CardContent className="space-y-4 pt-5">
            {["Effective membership dates", "Tenant isolation with RLS", "Immutable book currency", "Audited command boundary"].map((item) => <div key={item} className="flex items-center gap-3 text-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" /><span>{item}</span></div>)}
            <div className="rounded-lg border bg-muted/40 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><CircleAlert className="h-4 w-4 text-warning" />Production gates remain</div><p className="mt-2 text-sm leading-5 text-muted-foreground">Payment and regulated workflows stay in sandbox until their evidence and adversarial tests pass.</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, mono = false }: { label: string; value: string; detail: string; mono?: boolean }) {
  return <Card><CardContent className="p-5"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className={`mt-3 text-2xl font-semibold tracking-[-0.03em] ${mono ? "font-mono text-xl" : ""}`}>{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}
