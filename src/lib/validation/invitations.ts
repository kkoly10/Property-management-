import { z } from "zod";

export const relationshipTypes = ["resident_person", "owner_entity"] as const;
export const redirectSurfaces = ["crecy_living", "crecy_owner"] as const;

const surfaceForType: Record<(typeof relationshipTypes)[number], (typeof redirectSurfaces)[number]> = {
  resident_person: "crecy_living",
  owner_entity: "crecy_owner",
};

/**
 * The origin audience each portal surface belongs to.
 *
 * An invitation already carries the surface the recipient is being invited to, so the activation link
 * has no reason to be built from whichever host the INVITER happened to be on — an operator inviting a
 * resident from app.crecyos.com was sending that resident into Crecy OS to activate.
 */
export const audienceForSurface: Record<(typeof redirectSurfaces)[number], "resident" | "owner"> = {
  crecy_living: "resident",
  crecy_owner: "owner",
};

export const inviteRelationshipSchema = z.object({
  organizationId: z.uuid(),
  relationshipType: z.enum(relationshipTypes),
  relationshipId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  locale: z.enum(["en-US", "es-MX", "en-CA", "fr-CA"]),
  redirectSurface: z.enum(redirectSurfaces),
}).superRefine((invite, context) => {
  if (surfaceForType[invite.relationshipType] !== invite.redirectSurface) {
    context.addIssue({ code: "custom", path: ["redirectSurface"], message: "The portal must match the relationship type." });
  }
});

export const acceptRelationshipInvitationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/, "The invitation token is invalid."),
});

export type InviteRelationshipInput = z.infer<typeof inviteRelationshipSchema>;
export type AcceptRelationshipInvitationInput = z.infer<typeof acceptRelationshipInvitationSchema>;
