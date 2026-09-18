"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Plus, UserPlus, Wrench, X } from "lucide-react";
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

/**
 * Triage, assign, and — when there is nobody to assign to yet — add the vendor without leaving.
 *
 * The zero-vendor state used to be a sentence telling the operator to go and do something else. For a
 * brand-new organization that is every first work order, and the scope, priority and cost they had
 * already typed were the price of following that instruction.
 *
 * Three things make the inline path safe, and each is load-bearing:
 *
 *   * The vendor fields are NOT a nested `<form>` — that is invalid markup, and the browser resolves
 *     it by discarding the inner one. They are a div whose button is `type="button"`.
 *   * Enter inside a vendor field is intercepted. Left alone it submits the enclosing work-order
 *     form, which is the opposite of what someone typing a vendor name intends.
 *   * Creation does not call `router.refresh()`. Refreshing re-renders the server component and takes
 *     the half-filled work order with it; the new vendor is appended to local state instead, which is
 *     the whole point of doing this here rather than on the directory page.
 */
export function AssignVendorForm({ maintenanceRequestId, organizationId, vendors, disabled }: { maintenanceRequestId: string; organizationId: string; vendors: Vendor[]; disabled: boolean }) {
  const router = useRouter();
  const [options, setOptions] = useState<Vendor[]>(vendors);
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

  // Open by default when there is nobody to assign, because that is the only way forward from here.
  const [addingVendor, setAddingVendor] = useState(vendors.length === 0);
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorPending, setVendorPending] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const vendorKey = useRef<string | null>(null);
  const vendorSelect = useRef<HTMLSelectElement>(null);
  const vendorNameField = useRef<HTMLInputElement>(null);

  // Editing any field makes this a different vendor, so the key must not survive the edit.
  const vendorChanged = (set: (value: string) => void) => (value: string) => { vendorKey.current = null; set(value); };

  async function createVendor() {
    if (disabled || vendorPending || !vendorName.trim()) return;
    setVendorPending(true); setVendorError(null);
    vendorKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/vendors", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": vendorKey.current },
        body: JSON.stringify({
          organizationId,
          displayName: vendorName.trim(),
          ...(vendorEmail.trim() ? { email: vendorEmail.trim() } : {}),
          ...(vendorPhone.trim() ? { phoneE164: vendorPhone.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => null) as { vendorId?: string; displayName?: string; error?: string } | null;
      if (!response.ok || !body?.vendorId) {
        // A failed attempt must not reuse its key, or the retry is judged against the failed request.
        vendorKey.current = null;
        setVendorError(typeof body?.error === "string" ? body.error : "The vendor could not be added.");
        return;
      }
      const created: Vendor = { vendorId: body.vendorId, displayName: body.displayName ?? vendorName.trim(), email: null, phoneE164: null, status: "active" };
      setOptions((current) => [...current, created].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setVendorId(created.vendorId);
      setVendorName(""); setVendorEmail(""); setVendorPhone("");
      vendorKey.current = null;
      setAddingVendor(false);
      // Land on the field that now holds the answer, rather than wherever the collapsed panel was.
      requestAnimationFrame(() => vendorSelect.current?.focus());
    } catch {
      vendorKey.current = null;
      setVendorError("The vendor could not be added.");
    } finally {
      setVendorPending(false);
    }
  }

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

  const busy = disabled || pending;

  return <form onSubmit={submit} className="space-y-5">
    <WorkspacePanel
      title="Triage and assign"
      description="Set the official priority and assign a vendor to open the work-order lifecycle."
      bodyClassName="space-y-4 p-5 sm:p-6"
    >
      <div className="space-y-2"><Label htmlFor="wo-priority">Official priority</Label><NativeSelect id="wo-priority" value={priority} disabled={busy} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="emergency">Emergency</option></NativeSelect></div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="wo-vendor">Vendor</Label>
          {!addingVendor ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setAddingVendor(true); requestAnimationFrame(() => vendorNameField.current?.focus()); }}>
              <Plus aria-hidden="true" className="h-4 w-4" />Add vendor
            </Button>
          ) : null}
        </div>
        {options.length
          ? <NativeSelect ref={vendorSelect} id="wo-vendor" required value={vendorId} disabled={busy} onChange={(event) => setVendorId(event.target.value)}>{options.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.displayName}</option>)}</NativeSelect>
          : <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"><UserPlus aria-hidden="true" className="mr-1 inline h-4 w-4" />No vendors yet. Add the first one below — the rest of this form is kept as you left it.</p>}

        {addingVendor ? (
          /* Not a <form>: this sits inside the work-order form, and nesting forms is invalid markup. */
          <div
            className="space-y-3 rounded-lg border bg-muted/20 p-4"
            onKeyDown={(event) => {
              // Enter here means "add this vendor", never "create the work order".
              if (event.key === "Enter") { event.preventDefault(); void createVendor(); }
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">New vendor</p>
              {options.length ? <Button type="button" variant="ghost" size="sm" disabled={vendorPending} onClick={() => { setAddingVendor(false); setVendorError(null); }}><X aria-hidden="true" className="h-4 w-4" />Cancel</Button> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wo-vendor-name">Name</Label>
              <Input ref={vendorNameField} id="wo-vendor-name" value={vendorName} maxLength={160} placeholder="Northside Plumbing" disabled={busy || vendorPending} onChange={(event) => vendorChanged(setVendorName)(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wo-vendor-email">Email <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="wo-vendor-email" type="email" value={vendorEmail} placeholder="dispatch@example.com" disabled={busy || vendorPending} onChange={(event) => vendorChanged(setVendorEmail)(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wo-vendor-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="wo-vendor-phone" aria-describedby="wo-vendor-phone-format" value={vendorPhone} placeholder="+14045551234" disabled={busy || vendorPending} onChange={(event) => vendorChanged(setVendorPhone)(event.target.value)} />
                <p id="wo-vendor-phone-format" className="text-xs text-muted-foreground">E.164 format, e.g. +14045551234.</p>
              </div>
            </div>
            {vendorError ? <Alert variant="destructive"><AlertTitle>Vendor not added</AlertTitle><AlertDescription>{vendorError}</AlertDescription></Alert> : null}
            <Button type="button" variant="secondary" disabled={busy || vendorPending || !vendorName.trim()} onClick={() => void createVendor()}>
              {vendorPending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <UserPlus aria-hidden="true" className="h-4 w-4" />}
              {vendorPending ? "Adding…" : "Add vendor"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2"><Label htmlFor="wo-scope">Scope of work</Label><Textarea id="wo-scope" required minLength={3} maxLength={2000} placeholder="Diagnose and repair the kitchen sink leak." value={scope} disabled={busy} onChange={(event) => setScope(event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="wo-cost">Estimated cost (optional)</Label><Input id="wo-cost" inputMode="decimal" placeholder="0.00" value={estimatedCost} disabled={busy} onChange={(event) => setEstimatedCost(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="wo-currency">Currency</Label><NativeSelect id="wo-currency" value={currencyCode} disabled={busy || !estimatedCost.trim()} onChange={(event) => setCurrencyCode(event.target.value)}><option value="USD">USD</option><option value="CAD">CAD</option><option value="MXN">MXN</option></NativeSelect></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ownerApprovalRequired} disabled={busy} onChange={(event) => setOwnerApprovalRequired(event.target.checked)} />Require owner approval before this can be marked complete</label>
      {error ? <Alert variant="destructive"><AlertTitle>Work order not created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button className="w-full" size="lg" disabled={busy || !scope.trim() || !vendorId}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}{pending ? "Creating…" : "Create work order"}</Button>
    </WorkspacePanel>
  </form>;
}
