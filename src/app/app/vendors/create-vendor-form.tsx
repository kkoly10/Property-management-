"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateVendorForm({ organizationId, disabled }: { organizationId: string | null; disabled: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  // Editing any field makes this a different vendor, so the key must not survive the edit — replaying
  // the old key with new values is what IDEMPOTENCY_CONFLICT exists to catch.
  const changed = <T,>(set: (value: T) => void) => (value: T) => { idempotencyKey.current = null; setAdded(null); set(value); };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !organizationId || !displayName.trim()) return;
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/vendors", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          organizationId,
          displayName: displayName.trim(),
          // Omitted rather than sent empty: the schema treats these as optional, and "" is not an email.
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(phoneE164.trim() ? { phoneE164: phoneE164.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // A failed attempt must not reuse its key, or the retry is judged against the failed request.
        idempotencyKey.current = null;
        setError(typeof body?.error === "string" ? body.error : "The vendor could not be added.");
        return;
      }
      setAdded(displayName.trim());
      setDisplayName(""); setEmail(""); setPhoneE164("");
      idempotencyKey.current = null;
      router.refresh();
    } catch {
      idempotencyKey.current = null;
      setError("The vendor could not be added.");
    } finally {
      setPending(false);
    }
  }

  return <Card>
    <CardHeader><CardTitle>Add a vendor</CardTitle><CardDescription>Vendors are private to your organization and can be assigned to work orders.</CardDescription></CardHeader>
    <CardContent>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="vendor-display-name">Name</Label>
          <Input id="vendor-display-name" value={displayName} onChange={(event) => changed(setDisplayName)(event.target.value)} placeholder="Northside Plumbing" maxLength={160} required disabled={disabled} className="mt-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vendor-email">Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="vendor-email" type="email" value={email} onChange={(event) => changed(setEmail)(event.target.value)} placeholder="dispatch@example.com" disabled={disabled} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="vendor-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="vendor-phone" value={phoneE164} onChange={(event) => changed(setPhoneE164)(event.target.value)} placeholder="+14045551234" disabled={disabled} className="mt-2" />
            <p className="mt-1.5 text-xs text-muted-foreground">E.164 format, e.g. +14045551234.</p>
          </div>
        </div>
        {error ? <Alert variant="destructive"><AlertTitle>Vendor not added</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {added ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertTitle>{added} added</AlertTitle><AlertDescription>They can now be assigned to a work order.</AlertDescription></Alert> : null}
        <Button type="submit" disabled={disabled || pending || !displayName.trim()}>
          {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <UserPlus aria-hidden="true" className="h-4 w-4" />}
          {pending ? "Adding…" : "Add vendor"}
        </Button>
      </form>
    </CardContent>
  </Card>;
}
