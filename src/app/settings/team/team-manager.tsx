import type { StaffInvitation, StaffWorkspace } from "@/lib/data/staff";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffInviteForm } from "@/app/settings/team/staff-invite-form";
import { StaffMemberCard } from "@/app/settings/team/staff-member-card";

type TeamManagerProps = Pick<
  StaffWorkspace,
  "authenticatorLevel" | "organization" | "staffSeatCount" | "staffSeatLimit" | "members" | "invitations" | "roles" | "properties"
> & { disabled: boolean };

/**
 * What an operator is actually told about a pending invitation's email.
 *
 * "Queued" is honest at the moment of sending and useless a day later. These are the states the
 * notification worker really reaches, in the operator's own words — the one that matters is
 * `undeliverable`, because a pending invitation whose mail dead-lettered will never be accepted and
 * looks identical, on every other surface, to one sitting unread in an inbox.
 *
 * The relay's own error text is deliberately not here. `RELAY_UNAUTHORIZED` answers a question the
 * operator did not ask and cannot act on.
 */
const DELIVERY_COPY: Record<StaffInvitation["deliveryState"], { label: string; variant: "success" | "info" | "warning" | "destructive"; hint: string }> = {
  sent: { label: "Email sent", variant: "success", hint: "A mail provider accepted this message." },
  sending: { label: "Sending", variant: "info", hint: "A worker is delivering this message now." },
  queued: { label: "Email queued", variant: "info", hint: "Waiting for the next delivery run." },
  retrying: { label: "Retrying", variant: "warning", hint: "Delivery failed and will be attempted again." },
  undeliverable: { label: "Not delivered", variant: "destructive", hint: "Delivery was abandoned. Send a new invitation." },
  canceled: { label: "Not sent", variant: "warning", hint: "Delivery was cancelled before it was sent." },
  unknown: { label: "No delivery record", variant: "warning", hint: "This invitation predates delivery tracking." },
};

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
                const delivery = DELIVERY_COPY[invitation.deliveryState];
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
