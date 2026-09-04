"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ownerEntityTypes } from "@/lib/validation/owners";

export function CreateOwnerForm({ organizationId, disabled }: { organizationId: string | null; disabled: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [entityType, setEntityType] = useState<(typeof ownerEntityTypes)[number]>("person");
  const [email, setEmail] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const changed = <T,>(set: (value: T) => void) => (value: T) => { idempotencyKey.current = null; setAdded(null); set(value); };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !organizationId || !displayName.trim()) return;
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/owners", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({ organizationId, displayName: displayName.trim(), entityType, ...(email.trim() ? { email: email.trim() } : {}), ...(phoneE164.trim() ? { phoneE164: phoneE164.trim() } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) { idempotencyKey.current = null; setError(typeof body?.error === "string" ? body.error : "The owner could not be added."); return; }
      setAdded(displayName.trim());
      setDisplayName(""); setEmail(""); setPhoneE164(""); setEntityType("person");
      idempotencyKey.current = null;
      router.refresh();
    } catch { idempotencyKey.current = null; setError("The owner could not be added."); } finally { setPending(false); }
  }

  return <Card>
    <CardHeader><CardTitle>Add an owner</CardTitle><CardDescription>Owners are the people or entities that hold a share of a property.</CardDescription></CardHeader>
    <CardContent>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="owner-name">Name</Label><Input id="owner-name" value={displayName} onChange={(event) => changed(setDisplayName)(event.target.value)} placeholder="Rivera Family Trust" maxLength={160} required disabled={disabled} className="mt-2" /></div>
          <div><Label htmlFor="owner-type">Type</Label><NativeSelect id="owner-type" value={entityType} onChange={(event) => changed(setEntityType)(event.target.value as (typeof ownerEntityTypes)[number])} disabled={disabled} className="mt-2">{ownerEntityTypes.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</NativeSelect></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="owner-email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="owner-email" type="email" value={email} onChange={(event) => changed(setEmail)(event.target.value)} placeholder="owner@example.com" disabled={disabled} className="mt-2" /></div>
          <div><Label htmlFor="owner-phone">Phone <span className="text-muted-foreground">(optional)</span></Label><Input id="owner-phone" aria-describedby="owner-phone-format" value={phoneE164} onChange={(event) => changed(setPhoneE164)(event.target.value)} placeholder="+14045551234" disabled={disabled} className="mt-2" /><p id="owner-phone-format" className="mt-1.5 text-xs text-muted-foreground">E.164 format, e.g. +14045551234.</p></div>
        </div>
        {error ? <Alert variant="destructive"><AlertTitle>Owner not added</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {added ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertTitle>{added} added</AlertTitle><AlertDescription>Open the owner to record which properties they hold.</AlertDescription></Alert> : null}
        <Button type="submit" disabled={disabled || pending || !displayName.trim()}>{pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <UserPlus aria-hidden="true" className="h-4 w-4" />}{pending ? "Adding…" : "Add owner"}</Button>
      </form>
    </CardContent>
  </Card>;
}
