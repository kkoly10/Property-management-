import type { StaffWorkspace } from "@/lib/data/staff";
import { INVITATION_DELIVERY_COPY } from "@/lib/notifications/delivery-copy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffInviteForm } from "@/app/settings/team/staff-invite-form";
import { StaffMemberCard } from "@/app/settings/team/staff-member-card";

type TeamManagerProps = Pick<
  StaffWorkspace,
  "authenticatorLevel" | "organization" | "staffSeatCount" | "staffSeatLimit" | "members" | "invitations" | "roles" | "properties"
> & { disabled: boolean };

export function TeamManager({
  authenticatorLevel,
  organization,
  staffSeatCount,
  staffSeatLimit,
  members,
  invitations,
  roles,
  properties,
  disabled,
}: TeamManagerProps) {
  if (!organization) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No organization with team-management permission is available.</CardContent></Card>;
  }
  const seatsAvailable = staffSeatLimit === null || staffSeatCount < staffSeatLimit;
  // Only invitations still waiting on someone. An accepted or revoked one has an outcome already, and
  // how its email went is no longer a question anyone is asking.
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Invite staff</CardTitle>
              <CardDescription>Invitations expire after 72 hours. Sensitive roles and later property-scope changes are MFA-gated and audited.</CardDescription>
            </div>
            <Badge variant={seatsAvailable ? "info" : "warning"}>
              {staffSeatCount} / {staffSeatLimit ?? "∞"} seats · {organization.planCode}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <StaffInviteForm
            organizationId={organization.organizationId}
            roles={roles}
            properties={properties}
            authenticatorLevel={authenticatorLevel}
            disabled={disabled || !seatsAvailable}
          />
        </CardContent>
      </Card>
      {pending.length > 0 && (
        <section className="space-y-3" aria-labelledby="pending-invitations">
          <div>
            <h2 id="pending-invitations" className="text-xl font-semibold">Pending invitations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An invitation is only usable once its email reaches the recipient. This is the delivery state of that message, not of the invitation itself.
            </p>
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {pending.map((invitation) => {
                const delivery = INVITATION_DELIVERY_COPY[invitation.deliveryState];
                return (
                  <div key={invitation.invitationId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invitation.email}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{delivery.hint}</p>
                    </div>
                    <Badge variant={delivery.variant}>{delivery.label}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}
      <section className="space-y-3" aria-labelledby="team-roster">
        <div>
          <h2 id="team-roster" className="text-xl font-semibold">Team roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">Expired and revoked records remain visible for audit context but do not grant access.</p>
        </div>
        {members.map((member) => (
          <StaffMemberCard
            key={member.membershipId}
            member={member}
            roles={roles}
            properties={properties}
            authenticatorLevel={authenticatorLevel}
            disabled={disabled}
          />
        ))}
      </section>
    </div>
  );
}
