import "server-only";

/**
 * Whether an invitation EMAIL left, for a relationship invitation shown in a directory.
 *
 * A different question from `invitationState`. "Invited" says a record exists; this says whether the
 * message that makes it usable actually reached a transport. A pending invitation whose mail
 * dead-lettered will never be accepted and is otherwise indistinguishable from one sitting unread.
 *
 * Coarse on purpose. Provider message ids, relay error bodies and Resend internals stay server-side:
 * they answer a question the operator did not ask and cannot act on.
 */
export type InvitationDeliveryState =
  | "queued" | "sending" | "sent" | "retrying" | "undeliverable" | "canceled" | "unknown";

export const INVITATION_DELIVERY_STATES: InvitationDeliveryState[] =
  ["queued", "sending", "sent", "retrying", "undeliverable", "canceled", "unknown"];

/** Coerce against the known set: an unrecognized value means a worker state this build predates. */
export function normalizeDeliveryState(value: unknown): InvitationDeliveryState {
  return INVITATION_DELIVERY_STATES.find((state) => state === value) ?? "unknown";
}

/**
 * `relationshipId -> deliveryState` for every PENDING relationship invitation in the organization.
 *
 * Never throws: a directory that cannot render because a delivery-status lookup failed is a worse
 * outcome than a directory with no delivery badges. An empty map degrades to "no badge".
 */
export async function getRelationshipInvitationDelivery(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  organizationId: string,
): Promise<Map<string, InvitationDeliveryState>> {
  const delivery = new Map<string, InvitationDeliveryState>();
  const { data, error } = await supabase.rpc("list_relationship_invitation_delivery", {
    p_organization_id: organizationId,
  });
  if (error || !Array.isArray(data)) return delivery;
  for (const value of data) {
    const row = value as Record<string, unknown>;
    if (typeof row?.relationshipId === "string") {
      delivery.set(row.relationshipId, normalizeDeliveryState(row.deliveryState));
    }
  }
  return delivery;
}
