"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, UserPlus, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/crecy/workspace-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { Vendor } from "@/lib/data/maintenance";

type Result = { workOrderId: string; publicReference: string; status: string; ownerApprovalStatus: string | null };
const toMinor = (value: string) => { if (!value.trim()) return null; const number = Number(value); return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? Math.round(number * 100) : null; };

export function AssignVendorForm({ maintenanceRequestId, organizationId, vendors, disabled }: { maintenanceRequestId: string; organizationId: string; vendors: Vendor[]; disabled: boolean }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(vendors[0]?.vendorId ?? "");
  const [scope, setScope] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [ownerApprovalRequired, setOwnerApprovalRequired] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !vendorId) return;
    const estimatedCostMinor = toMinor(estimatedCost);
    if (estimatedCost.trim() && estimatedCostMinor === null) { setError("Enter a valid estimated cost."); return; }
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/work-orders", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          organizationId, maintenanceRequestId, vendorId, scope,
          estimatedCostMinor: estimatedCostMinor ?? undefined, currencyCode: estimatedCostMinor !== null ? currencyCode : undefined,
          ownerApprovalRequired, officialPriority: priority,
        }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The work order could not be created."); }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The work order could not be created.");
    } finally {
      setPending(false);
    }
  }

  if (result) return <Alert className="border-[#abefc6] bg-[#ecfdf3] text-success"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Work order {result.publicReference} created</AlertTitle><AlertDescription>Status: {result.status.replaceAll("_", " ")}{result.ownerApprovalStatus ? " · awaiting owner approval before it can complete" : ""}.</AlertDescription></Alert>;

  return <form onSubmit={submit} className="space-y-5">
    <WorkspacePanel
      title="Triage and assign"
      description="Set the official priority and assign a vendor to open the work-order lifecycle."
      bodyClassName="space-y-4 p-5 sm:p-6"
    >
      <div className="space-y-2"><Label htmlFor="wo-priority">Official priority</Label><NativeSelect id="wo-priority" value={priority} disabled={disabled || pending} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="emergency">Emergency</option></NativeSelect></div>
      <div className="space-y-2"><Label htmlFor="wo-vendor">Vendor</Label>{vendors.length ? <NativeSelect id="wo-vendor" required value={vendorId} disabled={disabled || pending} onChange={(event) => setVendorId(event.target.value)}>{vendors.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.displayName}</option>)}</NativeSelect> : <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"><UserPlus className="mr-1 inline h-4 w-4" />No vendors yet. An organization owner or admin must add one before a work order can be created.</p>}</div>
      <div className="space-y-2"><Label htmlFor="wo-scope">Scope of work</Label><Textarea id="wo-scope" required minLength={3} maxLength={2000} placeholder="Diagnose and repair the kitchen sink leak." value={scope} disabled={disabled || pending} onChange={(event) => setScope(event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="wo-cost">Estimated cost (optional)</Label><Input id="wo-cost" inputMode="decimal" placeholder="0.00" value={estimatedCost} disabled={disabled || pending} onChange={(event) => setEstimatedCost(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="wo-currency">Currency</Label><NativeSelect id="wo-currency" value={currencyCode} disabled={disabled || pending || !estimatedCost.trim()} onChange={(event) => setCurrencyCode(event.target.value)}><option value="USD">USD</option><option value="CAD">CAD</option><option value="MXN">MXN</option></NativeSelect></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ownerApprovalRequired} disabled={disabled || pending} onChange={(event) => setOwnerApprovalRequired(event.target.checked)} />Require owner approval before this can be marked complete</label>
      {error ? <Alert variant="destructive"><AlertTitle>Work order not created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button className="w-full" size="lg" disabled={disabled || pending || !scope.trim() || !vendorId}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}{pending ? "Creating…" : "Create work order"}</Button>
    </WorkspacePanel>
  </form>;
}
