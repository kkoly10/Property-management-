"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound, LoaderCircle, Save, ShieldCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import type { StaffMember, StaffProperty, StaffRole } from "@/lib/data/staff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type StaffMemberCardProps = {
  member: StaffMember;
  roles: StaffRole[];
  properties: StaffProperty[];
  authenticatorLevel: "aal1" | "aal2";
  disabled: boolean;
};

async function mutate(url: string, method: "PATCH" | "POST" | "PUT", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "The staff access change failed.");
  return result;
}

export function StaffMemberCard({
  member,
  roles,
  properties,
  authenticatorLevel,
  disabled,
}: StaffMemberCardProps) {
  const router = useRouter();
  const [roleCode, setRoleCode] = useState(member.roleCode);
  const [status, setStatus] = useState<"active" | "suspended">(member.status === "suspended" ? "suspended" : "active");
  const [mfaRequired, setMfaRequired] = useState(member.mfaRequired);
  const [propertyIds, setPropertyIds] = useState(member.propertyIds);
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<string>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const locked = disabled || member.isCurrentUser || member.status === "revoked" || Boolean(busyAction);
  const selectedRole = roles.find((role) => role.code === roleCode);

  async function run(action: string, operation: () => Promise<unknown>, message: string) {
    setBusyAction(action);
    setError(undefined);
    setSuccess(undefined);
    try {
      await operation();
      setSuccess(message);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The staff access change failed.");
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{member.displayName}</h3>
              {member.isCurrentUser ? <Badge variant="info">You</Badge> : null}
              <Badge variant={member.status === "active" ? "success" : member.status === "revoked" ? "neutral" : "warning"}>{member.status}</Badge>
              {member.mfaRequired ? <Badge variant="info"><ShieldCheck className="h-3 w-3" />MFA required</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{member.email ?? "Email unavailable"} · v{member.version}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {member.endsAt ? `Ends ${new Date(member.endsAt).toLocaleDateString()}` : "No scheduled end"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`role-${member.membershipId}`}>Role</Label>
            <NativeSelect id={`role-${member.membershipId}`} value={roleCode} onChange={(event) => setRoleCode(event.target.value as StaffRole["code"])} disabled={locked}>
              {roles.map((role) => <option key={role.code} value={role.code}>{role.displayName}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`status-${member.membershipId}`}>Status</Label>
            <NativeSelect id={`status-${member.membershipId}`} value={status} onChange={(event) => setStatus(event.target.value as "active" | "suspended")} disabled={locked || member.status === "invited"}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </NativeSelect>
          </div>
          <label className="flex min-h-10 items-center gap-3 self-end rounded-md border px-3 py-2 text-sm">
            <input type="checkbox" checked={mfaRequired} onChange={(event) => setMfaRequired(event.target.checked)} disabled={locked} className="h-4 w-4 accent-primary" />
            Require MFA
          </label>
        </div>

        <fieldset className="space-y-2" disabled={locked}>
          <legend className="text-sm font-medium">Property scopes</legend>
          <p className="text-xs text-muted-foreground">
            {selectedRole?.organizationWideAllowed ? "No selection means organization-wide access." : "At least one property is required for this role."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <label key={property.propertyId} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
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
          <Label htmlFor={`reason-${member.membershipId}`}>Audit reason</Label>
          <Input id={`reason-${member.membershipId}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={locked} placeholder="Why this access is changing" />
        </div>
        {authenticatorLevel !== "aal2" && !locked ? (
          <Alert variant="info"><KeyRound className="h-5 w-5" /><AlertDescription>Scope changes, revocation, and sensitive roles require MFA. <Link className="font-semibold underline" href="/settings/security/mfa?returnTo=/settings/team">Verify now</Link></AlertDescription></Alert>
        ) : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert variant="info"><AlertDescription>{success}</AlertDescription></Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={locked || member.status === "invited"}
            onClick={() => run("details", () => mutate(`/api/v1/staff/${member.membershipId}`, "PATCH", {
              roleCode,
              status,
              startsAt: member.startsAt,
              endsAt: member.endsAt,
              mfaRequired,
              expectedVersion: member.version,
              auditReason: reason,
            }), "Role and status saved.")}
          >
            {busyAction === "details" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save role/status
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={locked || member.status === "invited" || (!selectedRole?.organizationWideAllowed && propertyIds.length === 0)}
            onClick={() => run("scopes", () => mutate(`/api/v1/staff/${member.membershipId}/property-scopes`, "PUT", {
              propertyIds,
              expectedVersion: member.version,
              auditReason: reason,
            }), "Property access saved.")}
          >
            {busyAction === "scopes" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save property access
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={locked || reason.trim().length < 3}
            onClick={() => run("revoke", () => mutate(`/api/v1/staff/${member.membershipId}/revoke`, "POST", {
              expectedVersion: member.version,
              auditReason: reason,
            }), "Access revoked immediately.")}
          >
            {busyAction === "revoke" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}Revoke access
          </Button>
        </div>
        {member.isCurrentUser ? <p className="text-xs text-muted-foreground">Your own membership is protected from self-change and self-revocation.</p> : null}
      </CardContent>
    </Card>
  );
}
