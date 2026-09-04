"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { OwnerProperty } from "@/lib/data/owners";

// Percentage in, fraction out: the schema stores a fraction in (0,1], humans think in percent.
function toFraction(percent: string): number | null {
  if (!percent.trim()) return null;
  const value = Number(percent);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return Math.round((value / 100) * 1e8) / 1e8;
}

export function AddInterestForm({ organizationId, ownerEntityId, properties, allocatedByProperty, disabled }: { organizationId: string | null; ownerEntityId: string; properties: OwnerProperty[]; allocatedByProperty: Record<string, number>; disabled: boolean }) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.propertyId ?? "");
  const [percent, setPercent] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const changed = <T,>(set: (value: T) => void) => (value: T) => { idempotencyKey.current = null; setError(null); setAdded(false); set(value); };
  // A visible reflection of the statement engine's sum=1 rule, so the operator sees when a property is
  // fully allocated without the command having to reject a legitimate mid-edit state.
  const existing = Math.round((allocatedByProperty[propertyId] ?? 0) * 100);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !organizationId || !propertyId) return;
    const fraction = toFraction(percent);
    if (fraction === null) { setError("Enter a share between 0 and 100%."); return; }
    if (!effectiveFrom) { setError("Choose an effective-from date."); return; }
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/ownership-interests", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, propertyId, ownerEntityId, ownershipFraction: fraction, effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) { idempotencyKey.current = null; setError(typeof body?.error === "string" ? body.error : "The interest could not be added."); return; }
      setAdded(true); setPercent(""); setEffectiveTo("");
      idempotencyKey.current = null;
      router.refresh();
    } catch { idempotencyKey.current = null; setError("The interest could not be added."); } finally { setPending(false); }
  }

  if (properties.length === 0) return <Card><CardHeader><CardTitle>Add a property</CardTitle><CardDescription>Create a property before recording an ownership interest.</CardDescription></CardHeader></Card>;

  return <Card>
    <CardHeader><CardTitle>Record an ownership interest</CardTitle><CardDescription>Associate this owner with a property and their share of it.</CardDescription></CardHeader>
    <CardContent>
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="interest-property">Property</Label><NativeSelect id="interest-property" value={propertyId} onChange={(event) => changed(setPropertyId)(event.target.value)} disabled={disabled} className="mt-2">{properties.map((property) => <option key={property.propertyId} value={property.propertyId}>{property.propertyName}</option>)}</NativeSelect>{existing > 0 ? <p className="mt-1.5 text-xs text-muted-foreground">{existing}% of this property is already allocated. Statements require each property to total 100%.</p> : null}</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="interest-share">Share (%)</Label><Input id="interest-share" inputMode="decimal" value={percent} onChange={(event) => changed(setPercent)(event.target.value)} placeholder="50" disabled={disabled} className="mt-2" /></div>
          <div><Label htmlFor="interest-from">Effective from</Label><Input id="interest-from" type="date" value={effectiveFrom} onChange={(event) => changed(setEffectiveFrom)(event.target.value)} disabled={disabled} className="mt-2" /></div>
          <div><Label htmlFor="interest-to">Effective to <span className="text-muted-foreground">(optional)</span></Label><Input id="interest-to" type="date" value={effectiveTo} onChange={(event) => changed(setEffectiveTo)(event.target.value)} disabled={disabled} className="mt-2" /></div>
        </div>
        {error ? <Alert variant="destructive"><AlertTitle>Interest not added</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {added ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertTitle>Interest recorded</AlertTitle><AlertDescription>It now appears in this owner&apos;s holdings.</AlertDescription></Alert> : null}
        <Button type="submit" disabled={disabled || pending || !percent.trim() || !effectiveFrom}>{pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="h-4 w-4" />}{pending ? "Adding…" : "Add interest"}</Button>
      </form>
    </CardContent>
  </Card>;
}
