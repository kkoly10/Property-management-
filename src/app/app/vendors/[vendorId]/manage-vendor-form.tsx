"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ManagedVendor } from "@/lib/data/maintenance";

/**
 * Vendor management.
 *
 * The command replaces the mutable fields rather than merging them, so this form always sends the
 * complete desired state and turns an empty contact field into an explicit `null`. That is what makes
 * "clear the email" expressible at all — a merge would read the same omission as "leave it alone".
 *
 * Archiving is the same command with a different status. Nothing here deletes: work orders reference
 * the vendor by id, and an archived vendor keeps naming itself on every one it already has.
 */
export function ManageVendorForm({ organizationId, vendor, disabled }: { organizationId: string | null; vendor: ManagedVendor; disabled: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(vendor.displayName);
  const [email, setEmail] = useState(vendor.email ?? "");
  const [phoneE164, setPhoneE164] = useState(vendor.phoneE164 ?? "");
  const [status, setStatus] = useState(vendor.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  // A different desired state is a different request, so the key cannot outlive an edit.
  const changed = (set: (value: string) => void) => (value: string) => { idempotencyKey.current = null; setSaved(null); set(value); };

  async function save(nextStatus?: string) {
    if (disabled || !organizationId || !displayName.trim()) return;
    const desiredStatus = nextStatus ?? status;
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/vendors/${vendor.vendorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          organizationId,
          displayName: displayName.trim(),
          email: email.trim() ? email.trim() : null,
          phoneE164: phoneE164.trim() ? phoneE164.trim() : null,
          status: desiredStatus,
        }),
      });
      const body = await response.json().catch(() => null) as { status?: string; error?: string } | null;
      if (!response.ok) {
        idempotencyKey.current = null;
        setError(typeof body?.error === "string" ? body.error : "The vendor could not be updated.");
        return;
      }
      setStatus(desiredStatus);
      setSaved(desiredStatus === "archived" ? "Vendor archived." : "Vendor updated.");
      idempotencyKey.current = null;
      router.refresh();
    } catch {
      idempotencyKey.current = null;
      setError("The vendor could not be updated.");
    } finally {
      setPending(false);
    }
  }

  const busy = disabled || pending;

  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <div className="space-y-2">
      <Label htmlFor="manage-vendor-name">Name</Label>
      <Input id="manage-vendor-name" value={displayName} maxLength={160} required disabled={busy} onChange={(event) => changed(setDisplayName)(event.target.value)} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="manage-vendor-email">Email <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="manage-vendor-email" type="email" value={email} placeholder="dispatch@example.com" disabled={busy} onChange={(event) => changed(setEmail)(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manage-vendor-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="manage-vendor-phone" aria-describedby="manage-vendor-phone-format" value={phoneE164} placeholder="+14045551234" disabled={busy} onChange={(event) => changed(setPhoneE164)(event.target.value)} />
        <p id="manage-vendor-phone-format" className="text-xs text-muted-foreground">E.164 format, e.g. +14045551234.</p>
      </div>
    </div>
    <div className="space-y-2">
      <Label htmlFor="manage-vendor-status">Status</Label>
      <NativeSelect id="manage-vendor-status" aria-describedby="manage-vendor-status-help" value={status} disabled={busy} onChange={(event) => changed(setStatus)(event.target.value)}>
        <option value="active">Active — can be assigned to new work orders</option>
        <option value="inactive">Inactive — kept on record, not assignable</option>
        <option value="archived">Archived — kept on record, not assignable</option>
      </NativeSelect>
      <p id="manage-vendor-status-help" className="text-xs text-muted-foreground">Only active vendors appear when assigning a new work order. Existing work orders keep this vendor whatever the status.</p>
    </div>

    {error ? <Alert variant="destructive"><AlertTitle>Vendor not updated</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {saved ? <Alert variant="info"><CheckCircle2 aria-hidden="true" className="h-5 w-5" /><AlertTitle>{saved}</AlertTitle><AlertDescription>The directory and assignment choices now reflect this.</AlertDescription></Alert> : null}

    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || !displayName.trim()}>
        {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
      {status !== "archived" ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save("archived")}>
          <Archive aria-hidden="true" className="h-4 w-4" />Archive vendor
        </Button>
      ) : null}
    </div>
  </form>;
}
