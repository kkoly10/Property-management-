"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import type { StaffProperty, StaffRole } from "@/lib/data/staff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type StaffInviteFormProps = {
  organizationId: string;
  roles: StaffRole[];
  properties: StaffProperty[];
  authenticatorLevel: "aal1" | "aal2";
  disabled: boolean;
};

export function StaffInviteForm({
  organizationId,
  roles,
  properties,
  authenticatorLevel,
  disabled,
}: StaffInviteFormProps) {
  const router = useRouter();
  const [roleCode, setRoleCode] = useState(roles[0]?.code ?? "property_manager");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [mfaRequired, setMfaRequired] = useState(Boolean(roles[0]?.sensitive));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<{ message: string; activationUrl: string }>();
  const role = roles.find((item) => item.code === roleCode);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const form = new FormData(event.currentTarget);
    const localStart = String(form.get("startsAt") ?? "");
    const localEnd = String(form.get("endsAt") ?? "");
    try {
      const response = await fetch("/api/v1/staff/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          organizationId,
          email: form.get("email"),
          roleCode,
          propertyIds,
          startsAt: localStart ? new Date(localStart).toISOString() : null,
          endsAt: localEnd ? new Date(localEnd).toISOString() : null,
          mfaRequired,
          locale: form.get("locale"),
          auditReason: form.get("auditReason"),
        }),
      });
      const result = await response.json() as {
        error?: string;
        activationUrl?: string;
        activationEmailSent?: boolean;
      };
      if (!response.ok || !result.activationUrl) throw new Error(result.error ?? "The invitation could not be created.");
      setSuccess({
        message: result.activationEmailSent
          ? "The activation email was sent and the 72-hour staff invitation is recorded."
          : "The invitation is recorded. Share the activation link with the recipient.",
        activationUrl: result.activationUrl,
      });
      event.currentTarget.reset();
      setPropertyIds([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="staff-email">Email</Label>
          <Input id="staff-email" name="email" type="email" autoComplete="email" required disabled={disabled || busy} placeholder="manager@example.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <NativeSelect
            id="staff-role"
            name="roleCode"
            value={roleCode}
            onChange={(event) => {
              const nextRole = event.target.value as StaffRole["code"];
              setRoleCode(nextRole);
              if (roles.find((item) => item.code === nextRole)?.sensitive) setMfaRequired(true);
            }}
            disabled={disabled || busy}
          >
            {roles.map((item) => <option key={item.code} value={item.code}>{item.displayName}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-start">Starts <span className="font-normal text-muted-foreground">(now if blank)</span></Label>
          <Input id="staff-start" name="startsAt" type="datetime-local" disabled={disabled || busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-end">Ends <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="staff-end" name="endsAt" type="datetime-local" disabled={disabled || busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-locale">Invitation language</Label>
          <NativeSelect id="staff-locale" name="locale" defaultValue="en-US" disabled={disabled || busy}>
            <option value="en-US">English (United States)</option>
            <option value="es-MX">Español (México)</option>
            <option value="en-CA">English (Canada)</option>
            <option value="fr-CA">Français (Canada)</option>
          </NativeSelect>
        </div>
        <label className="flex min-h-10 items-center gap-3 self-end rounded-md border bg-card px-3 py-2 text-sm">
          <input name="mfaRequired" type="checkbox" checked={mfaRequired} onChange={(event) => setMfaRequired(event.target.checked)} disabled={disabled || busy || Boolean(role?.sensitive)} className="h-4 w-4 accent-primary" />
          Require MFA for this user
        </label>
      </div>
      <fieldset className="space-y-2" disabled={disabled || busy}>
        <legend className="text-sm font-medium">Property access</legend>
        <p className="text-xs text-muted-foreground">
          {role?.organizationWideAllowed ? "Leave every property clear for organization-wide access, or select an explicit subset." : "This role requires at least one property."}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {properties.map((property) => (
            <label key={property.propertyId} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={propertyIds.includes(property.propertyId)}
                onChange={(event) => setPropertyIds((current) =>
                  event.target.checked
                    ? [...current, property.propertyId]
                    : current.filter((id) => id !== property.propertyId))}
                className="h-4 w-4 accent-primary"
              />
              {property.propertyName}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="staff-invite-reason">Audit reason <span className="font-normal text-muted-foreground">(required for owner, admin, or accountant)</span></Label>
        <Input id="staff-invite-reason" name="auditReason" maxLength={500} disabled={disabled || busy} placeholder="Role and access needed for…" />
      </div>
      {role?.sensitive && authenticatorLevel !== "aal2" ? (
        <Alert variant="info"><ShieldCheck className="h-5 w-5" /><AlertDescription>Verify with MFA before inviting this sensitive role. <Link className="font-semibold underline" href="/settings/security/mfa?returnTo=/settings/team">Verify now</Link></AlertDescription></Alert>
      ) : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? (
        <Alert variant="info">
          <CheckCircle2 className="h-5 w-5" />
          <AlertDescription>
            <p>{success.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(success.activationUrl)}>
                <Copy className="h-4 w-4" />Copy activation link
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={disabled || busy || (!role?.organizationWideAllowed && propertyIds.length === 0)}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy ? "Creating invitation…" : "Invite staff member"}
      </Button>
    </form>
  );
}
